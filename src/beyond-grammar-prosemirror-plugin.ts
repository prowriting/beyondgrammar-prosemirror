import {
    GrammarCheckerSettings, ServiceSettings, BGOptions, IEditableWrapper,
    HighlightInfo, Tag, ThesaurusData
} from "./interfaces/editable-wrapper";
import {objectAssign} from "./utils";
import {PluginSpec, Transaction} from "prosemirror-state";
import {Decoration, DecorationSet} from "prosemirror-view";
import * as ProseMirrorView  from 'prosemirror-view';
import * as ProseMirrorState from 'prosemirror-state';
import * as ProseMirrorModel from 'prosemirror-model';
import {uuid} from "./utils/uuid";
//import {DecorationSet} from "prosemirror-view"

export function createBeyondGrammarPluginSpec(pm, element : HTMLElement, bgOptions ?: BGOptions ) {
    //let scriptLoader = 
    // sourcePath specified in first argument, as we want to seal plugin on concrete version of BG core
    /*bgOptions = <BGOptions>objectAssign({ service : { sourcePath: "//localhost:8080/bundle.js" }, }, bgOptions , {
        service : {
            serviceUrl : '//rtg.prowritingaid.com',
        },
        
        grammar : {}
    });*/
    //TODO return restoring/defaulting config
    
    
    let plugin = new BeyondGrammarProseMirrorPlugin(pm, bgOptions.service, bgOptions.grammar);
    
    
    
    //setTimeout(()=>{
        let grammarChecker = new window["BeyondGrammar"].GrammarChecker(element, bgOptions.service, bgOptions.grammar, plugin);
        grammarChecker.init().then(()=>{
            grammarChecker.activate();
            plugin.activate();
        });
    //}, 1000)
    
    
    return plugin;//new BeyondGrammarProseMirrorPlugin(pm, bgOptions.serviceSettings, bgOptions.grammarSettings);

    /*let script = document.createElement("script");
    script.src = "bundle.js?r=" + Math.ceil(Math.random() * 1e6);
    (document.head || document.body).appendChild(script);

    let r = false;
    script.onload = script["onreadystatechange"] = function(){
        if ( !r && (!this.readyState || this.readyState == 'complete') )
        {
            r = true;
            
            let GrammarChecker = window["BeyondGrammar"].GrammarChecker;
            let grammarChecker = new GrammarChecker(bgOptions.serviceSettings, bgOptions.grammarSettings);
            
            onLoad && onLoad( new BeyondGrammarProsemirrorPlugin(bgOptions.serviceSettings, bgOptions.grammarSettings) );
        }
    }*/
}

/*export function createPlugin(bgOptions ?: BGOptions){
    
}*/

const PWA_DECO_UPDATE_META = 'pwa-deco-update';

class DecorationInfo{
    id: string;
    highlightInfo: HighlightInfo;
    tag: Tag;
    inclusiveStart: boolean = true;
    inclusiveEnd: boolean = true;

    constructor(tag: Tag){
        this.tag = tag;
        this.highlightInfo = new HighlightInfo();
        this.highlightInfo.category=tag.category;
        this.highlightInfo.hint=tag.hint;
        this.highlightInfo.suggestions=tag.suggestions;

        this.id = 'pwa-' + uuid();
    }
}

class DocRange {
    constructor(from: number, to: number){
        this.from=from;
        this.to=to;
    }
    from: number;
    to: number;
}


//idea to combine in one class two implementations: bg wrapper + pm plugin, so we can work in one scope
export class BeyondGrammarProseMirrorPlugin implements PluginSpec, IEditableWrapper{
    onShowThesaurus: (thesaurusData: ThesaurusData, contextWindow: Window) => boolean;
    onBlockChanged: (block: HTMLElement) => void;
    onPopupClose: () => void;
    onPopupDeferClose: () => void;
    onCheckRequired: () => void;
    onShowPopup: (uid: string, elem: Element) => void;
    //TODO
    //Async stuff
    
    //public init()

    public editorView: ProseMirrorView.EditorView;
    private _state : any;
    private decos : DecorationSet;
    private doc : ProseMirrorModel.Node;
    
    constructor( private pm, private serviceSettings : ServiceSettings, private grammarCheckerSettings : GrammarCheckerSettings){
        this.initState();
    }
    
    initState() {
        let self = this;
        this.decos = DecorationSet.empty;
        this._state = {
            init(config, state){
                // we should start the checker
                //self.onCheckRequired();
                // we do nothing here
                self.doc= state.doc;
                console.log(self.doc);
                return self.decos;
            },
            
            apply( tr, value, old ) {
                if (tr.docChanged) {
                    // I think we need to update our decos using the mapping of
                    // the transaction. This should update all the from and tos
                    this.decos.map(tr.mapping);

                    // get the range that is affected by the transformation
                    var range = self.rangeFromTransform(tr);

                    // update all the blocks that have been affected by the transformation
                    this.doc.nodesBetween(range.from, range.to, (elem) => {
                        if (elem.isTextblock) {
                            if (self.onBlockChanged) {
                                self.onBlockChanged(elem);
                            }
                            return false;
                        }
                        return true;
                    });

                    // set off a check
                    if (self.onCheckRequired) {
                        self.onCheckRequired();
                    }
                }
                // a special transaction just for us to supply our updated decos
                if (tr.getMeta(PWA_DECO_UPDATE_META)){
                    return self.decos;
                }
                return tr.docChanged ? self.decos : old
            }
        }
    }

    activate() {
        
    }

    get state(): any {
        return this._state;
    }
    getText(blockElement:HTMLElement):string {
        let node = <ProseMirrorModel.Node>(<any>blockElement);
        return node.textContent;
    }

    clearMarks(skipIgnored:boolean):void {
        if (!skipIgnored) {
            this.decos = DecorationSet.empty;
        }else {
            // TODO skip ignore depends on the implementation of ignore
        }
        this.applyDecoUpdateTransaction();
    }

    bindEditable():void {
    }

    unbindEditable():void {
    }

    bindChangeEvents():void {
    }

    unbindChangeEvents():void {
    }

    getAllElements():HTMLElement[] {
        let result = [];
        this.doc.descendants((node)=>{
            if (node.isTextblock){
                result.push(node);
                return false;
            }
            return true;
        });
        return result;
    }

    private getPositionInDocument(theNode: ProseMirrorModel.Node): number{
        var pos = 0;
        var finished = false;
        this.doc.descendants((node)=>{
            if (finished){
                return false;
            }
            if (node.isTextblock){
                if (node.eq(theNode)){
                    finished=true;
                }else {
                    pos += node.textContent.length;
                }
                return false;
            }
            return true;
        });
        return pos;
    }

    private rangeFromTransform(tr: Transaction): DocRange {
        let from, to
        for (let i = 0; i < tr.steps.length; i++) {
            let step = <any>tr.steps[i],
                map = step.getMap()
            let stepFrom = map.map(step.from || step.pos, -1)
            let stepTo = map.map(step.to || step.pos, 1)
            from = from ? map.map(from, -1).pos.min(stepFrom) : stepFrom
            to = to ? map.map(to, 1).pos.max(stepTo) : stepTo
        }
        return new DocRange( from, to );
    }

    applyHighlightsSingleBlock(elem:HTMLElement, text:string, tags:Tag[], checkAll:boolean):void {
        console.log("apply")
        let node = <ProseMirrorModel.Node><any>elem;
        if (text == node.textContent) {
            let start = this.getPositionInDocument(node);
            let length = text.length;
            // find the decos from the start and end of this element an remove them
            var decosForBlock = this.decos.find(start,start+length);
            let newDecos = [];
            for(var i = 0; i < tags.length; i++){
                let tag = tags[i];
                let existing : Decoration = null;
                for(var k= 0; k< decosForBlock.length-1; k++){
                    if (decosForBlock[k].from===tag.startPos && decosForBlock[k].to===tag.endPos){
                        decosForBlock.splice(i,1);
                        existing=decosForBlock[k];
                        (<DecorationInfo>existing.spec).tag=tag;
                    }
                }
                if (existing===null) {
                    // check for an existing decoration
                    //
                    let attrs = {
                        class: 'pwa-highlight'
                    };
                    let deco = ProseMirrorView.Decoration.inline(tag.startPos, tag.endPos, attrs, new DecorationInfo(tag));
                    newDecos.push(deco);
                }
            }
            this.decos= this.decos.remove(decosForBlock).add(this.doc, newDecos);
            this.applyDecoUpdateTransaction();
        }
    }

    private applyDecoUpdateTransaction(){
        let tr = this.editorView.state.tr;
        tr.setMeta(PWA_DECO_UPDATE_META,true);
        this.editorView.state.applyTransaction(tr)
    }

    onAddToDictionary(uid:string):void {
        let deco = this.getDecoById(uid);
        if (deco) {
            let specToAdd: DecorationInfo = <DecorationInfo>deco.spec;
            let decosToRemove = this.decos.find(null, null, (spec) => {
                if ((<DecorationInfo>spec).tag.category == specToAdd.tag.category){
                    if ((<DecorationInfo>spec).highlightInfo.word==specToAdd.highlightInfo.word){
                        return true;
                    }
                }
                return false;
            });
            this.decos=this.decos.remove(decosToRemove);
            this.applyDecoUpdateTransaction();
        }
    }

    getHighlightInfo(uid:string):HighlightInfo {
        var decos = this.editorView.props.decorations(this.editorView.state);
        if (decos) {
            let highlights = (<DecorationSet>decos).
            find(0, this.doc.textContent.length, (spec: { [key: string]: any }) => {
                return (<DecorationInfo>spec).id == uid;
            });
            if (highlights){
                return <HighlightInfo>highlights[0].spec;
            }
        }
        return null;
    }

    updateAfterPaste():void {
    }

    resetSpellCheck():void {
        // nothing to do. spellcheck doesn't work in prosemirror
    }

    restoreSpellCheck():void {
        // nothing to do. spellcheck doesn't work in prosemirror
    }

    getCurrentErrorCount():number {
        return this.decos.find().length;
    }

    ignore(uid:string):void {
        //TODO change the deco to ignored
        this.applyDecoUpdateTransaction();
    }

    omit(uid:string):void {
        let deco = this.getDecoById(uid);
        if (deco){
            let tr = this.editorView.state.tr;
            tr.delete(deco.from,deco.to);
            this.editorView.state.applyTransaction(tr)
        }
        this.applyDecoUpdateTransaction();
    }

    accept(uid:string, suggestion:string):void {
        /*let deco = this.getDecoById(uid);
        if (deco){
            let tr = this.editorView.state.tr;
            let slice = new Slice();
            tr.replace(deco.from,deco.to,slice);
            this.editorView.state.applyTransaction(tr)
        }*/
        this.applyDecoUpdateTransaction();
    }

    applyThesaurus(replacement:string):void {

    }

    private getDecoById(uuid: string):Decoration{
        let decos = this.decos.find(null,null,(spec)=>{
            if ((<DecorationInfo>spec).id==uuid){
                return true;
            }
            return false;
        });
        return decos[0];
    }
}



window["BeyondGrammar"] = window["BeyondGrammar"] || {};
window["BeyondGrammar"].createBeyondGrammarPluginSpec = createBeyondGrammarPluginSpec;