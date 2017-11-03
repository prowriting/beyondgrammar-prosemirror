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
import * as $ from "jquery";
import {Mark, Slice} from "prosemirror-model";
import {strictEqual} from "assert";
//import {DecorationSet} from "prosemirror-view"
export const CSS_IGNORED = 'pwa-mark-ignored';

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

    let $element = $(element);
    let plugin = new BeyondGrammarProseMirrorPlugin($element, bgOptions.service, bgOptions.grammar);

    window["BeyondGrammar"].loadPwaMarkStyles(window);
    
    //setTimeout(()=>{
        let grammarChecker = new window["BeyondGrammar"].GrammarChecker($element.find('[contenteditable]')[0], bgOptions.service, bgOptions.grammar, plugin);
        grammarChecker.init().then(()=>{
            grammarChecker.activate();
            plugin.activate();
        });
    //}, 1000
    
    
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
        this.highlightInfo.word = "//TODO"; //TODO  //tag.text.substring(tag.startPos, tag.endPos);

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
    
    constructor( private $element_ : JQuery, private serviceSettings : ServiceSettings, private grammarCheckerSettings : GrammarCheckerSettings){
        this.initState();

        this.$element_.on('scroll', ()=> {
            // close the popup, otherwise it moves away from the word
            if (this.onPopupClose){
                this.onPopupClose();
            }
        });

        this.$element_.on('keydown', (evt)=> {
            // if we press a button in the text then close the popup
            if(evt.keyCode == 17){
                //temporally solution for awhile we use ctrlKey for opening contextual thesaurus
                return;
            }
            if (this.onPopupClose){
                this.onPopupClose();
            }
        });

        // activates suggestion popup
        // @TODO: move to separate method
        this.$element_.on('mouseover touchend', `.pwa-mark:not(.${CSS_IGNORED})`, (evt: JQueryEventObject) => {
            let elem = evt.target,
                uid = elem.getAttribute('data-pwa-id');

            if (this.onShowPopup){
                this.onShowPopup(uid, elem);
            }
        });

        this.$element_.on('mouseleave', '.pwa-mark', () => {
            if (this.onPopupDeferClose){
                this.onPopupDeferClose();
            }
        });
        
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
                //console.log(self.doc);
                return self.decos;
            },
            
            apply( tr : Transaction, value, old ) {
                if (tr.docChanged) {
                    // I think we need to update our decos using the mapping of
                    // the transaction. This should update all the from and tos
                    //self.decos.map(tr.mapping);
                    //this.spec.decos.map(tr.mapping, self.doc);
                    // get the range that is affected by the transformation

                    this.spec.decos.map(tr.mapping, self.doc);
                    
                    
                    let range = self.rangeFromTransform(tr);
                    //console.log(range);
                    // update all the blocks that have been affected by the transformation
                    //console.log(self.doc);
                    
                    self.doc.nodesBetween(range.from, range.to, (elem) => {
                        if (elem.isTextblock) {
                            if (self.onBlockChanged) {
                                console.info("onBlockChanged", elem);
                                self.onBlockChanged(<any>elem);
                                return false;
                            }

                        }
                        return true;
                    });

                    //
                    
                    //console.log((tr)); 
                     
                    //self.onBlockChanged( <any>tr.selection.$head.parent );

                    //console.log(self.onCheckRequired);
                    
                    // set off a check
                    if (self.onCheckRequired) {
                        self.onCheckRequired();
                    }
                }
                // a special transaction just for us to supply our updated decos
                if (tr.getMeta(PWA_DECO_UPDATE_META)){
                    //this.spec.decos.map(tr.mapping, self.doc);
                    this.spec.decos.map(tr.mapping, self.doc); 
                    console.info("apply highlights");
                    return self.decos;
                }
                //value.apply(tr);
                //console.info(value == this.decos);
                return tr.docChanged ? self.decos : old
            }
        }
    }

    activate() {
        
    }

    get state(): any {
        return this._state;
    }
    
    get props() : any{
        let self = this;
        return {
            decorations(state) { return this.spec.decos },
            handleDOMEvents(){ console.log("event", arguments) }
        }
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
        let from, to;
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
        //console.log("apply")
        let node = <ProseMirrorModel.Node><any>elem;
        if (text == node.textContent) {
            let start = this.getPositionInDocument(node);
            let length = text.length;
            // find the decos from the start and end of this element an remove them
            var decosForBlock = this.decos.find(start,start+length);
            //console.log(decosForBlock);
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
                    let info = new DecorationInfo(tag);
                    let attrs = {
                        class: 'pwa-mark',
                        nodeName : "span",
                        "data-pwa-id" : info.id,
                        'data-pwa-category': tag.category.toLowerCase(),
                        'data-pwa-hint': tag.hint,
                        'data-pwa-suggestions': tag.suggestions.join("~"),
                        'data-pwa-dictionary-word' : tag.text//,//textAndMap.text.substr(tag.startPos,tag.endPos-tag.startPos+1)
                    };
                    
                    let deco = ProseMirrorView.Decoration.inline(tag.startPos, tag.endPos, attrs, info);

                    newDecos.push(deco);
                }
            }
            
            //console.log("new ", newDecos);
            this.decos= this.decos.remove(decosForBlock).add(this.doc, newDecos);
            
            this.applyDecoUpdateTransaction();
        }
    }

    private applyDecoUpdateTransaction(){
        let tr = this.editorView.state.tr;
        tr.setMeta(PWA_DECO_UPDATE_META,true);
        //this.decos.map(tr.mapping, this.doc);
        let newState = this.editorView.state.apply(tr);
        this.editorView.updateState(newState);
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
        var decos = this.decos;///this.editorView.props.decorations(this.editorView.state);
        if (decos) {
            let highlights = (<DecorationSet>decos).
            find(0, this.doc.textContent.length, (spec: { [key: string]: any }) => {
                return (<DecorationInfo>spec).id == uid;
            });
            if (highlights){
                return <HighlightInfo>highlights[0].spec.highlightInfo;
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
        let deco = this.getDecoById(uid);
        if (deco){
            this.decos = this.decos.remove([deco]);
            let tr = this.editorView.state.tr;
            //let slice = new Slice();
            tr.replace(deco.from,deco.to);
            tr.insertText(suggestion);
            this.editorView.state.applyTransaction(tr);
            this.applyDecoUpdateTransaction();
        }
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