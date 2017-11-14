import {
    GrammarCheckerSettings, ServiceSettings, BGOptions, IEditableWrapper,
    HighlightInfo, Tag, ThesaurusData
} from "./interfaces/editable-wrapper";
import {PluginSpec, Transaction} from "prosemirror-state";
import {Decoration, DecorationSet, EditorProps} from "prosemirror-view";
import * as ProseMirrorView  from 'prosemirror-view';
import * as ProseMirrorModel from 'prosemirror-model';
import {uuid} from "./utils/uuid";
import * as $ from "jquery";
import {HighlightSpec} from "./highlight-spec";
import {createDecorationAttributesFromSpec} from "./utils";
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
    let $contentEditable = $element.find("[contenteditable]");
    let plugin = new BeyondGrammarProseMirrorPlugin($element, bgOptions.service, bgOptions.grammar);

    window["BeyondGrammar"].loadPwaMarkStyles(window);

    let grammarChecker = new window["BeyondGrammar"].GrammarChecker($contentEditable[0], bgOptions.service, bgOptions.grammar, plugin);
    grammarChecker.init().then(()=>{
        grammarChecker.activate();
        plugin.activate();
    });
    
    
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
    private _props : EditorProps;
    private decos : DecorationSet;
    private doc : ProseMirrorModel.Node;
    
    constructor( private $element_ : JQuery, private serviceSettings : ServiceSettings, private grammarCheckerSettings : GrammarCheckerSettings){
        this.initState();
        this.initProps();
        this.bindEditableEvents();
    }
    
    bindEditableEvents() {
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

    /**
     * Implementation of ProseMirror plugin interface
     */
    
    initState() {
        let self = this;
        this.decos = DecorationSet.empty;//.create(this.doc, []);
        
        this._state = {
            init(config, state){
                // we should start the checker
                //self.onCheckRequired();
                // we do nothing here
                self.doc= state.doc;
                //console.log(self.doc);
                return {decos : self.decos};
            },
            
            apply( tr : Transaction, pluginState, old, newState ) {
                
                console.log("apply value=", pluginState);
                
                //storing new doc, as it was changed after transactions
                self.doc = newState.doc;
                
                if (tr.docChanged) {
                    // I think we need to update our decos using the mapping of
                    // the transaction. This should update all the from and tos
                    
                    //storing new decos after mapping changes
                    self.decos = self.decos.map(tr.mapping, self.doc);

                    // get the range that is affected by the transformation
                    let range = self.rangeFromTransform(tr);
                    
                    // update all the blocks that have been affected by the transformation
                    self.doc.nodesBetween(range.from, range.to, (elem) => {
                        if (elem.isTextblock) {
                            if (self.onBlockChanged) {
                                console.info("onBlockChanged", elem);
                                self.onBlockChanged(<any>elem);
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
                    self.decos = self.decos.map(tr.mapping, self.doc);
                    return { decos : self.decos };
                }
                
                return { decos : self.decos };
            }
        }
    }
    
    initProps() {
        this._props = {
            decorations(state) { return this.spec.decos }
        }
    }
    
    get state(): any {
        return this._state;
    }

    get props() : any{
        return this._props;
    }
    
    activate() {
        
    }

    /**
     * Implementations of IEditableWrapper
     */
    
    applyHighlightsSingleBlock(elem:HTMLElement, text:string, tags:Tag[], checkAll:boolean):void {
        
        let node = <ProseMirrorModel.Node><any>elem;
        if (text == node.textContent) {
            let start = this.getPositionInDocument(node);
            let length = text.length;
            // find the decos from the start and end of this element and remove them
            let decosForBlock = this.decos.find(start,start + length);
            
            console.info("element", node.textContent);
            console.info("start", start);
            console.info("FOUND", decosForBlock.length);
            
            let newDecos = [];
            for(let i = 0; i < tags.length; i++){
                let tag = tags[i];
                let tagPos = { from : tag.startPos + start, to : tag.endPos + start + 1 };
                let existing : Decoration = null;
                
                for(let k = 0; k < decosForBlock.length; k++){
                    let deco = decosForBlock[k];
                    let spec = <HighlightSpec>deco.spec;
                    if (deco.from===tagPos.from  && deco.to===tagPos.to){ 
                        //update tag item with new tag instance
                        spec.tag=tag;

                        // As I understand we should make step backward, as if we've removed on k, k+1 in next iteration
                        // skips, as it was shifted
                        decosForBlock.splice(k--,1);
                        
                        existing=deco;
                        break;
                    }
                }
                
                // no existing, so we can say it is new???
                if (existing===null) {
                    // check for an existing decoration  
                    //
                    let word = node.textContent.substring(tag.startPos, tag.endPos+1);
                    let spec = new HighlightSpec(tag, word);
                    let attributes = createDecorationAttributesFromSpec(spec);
                    
                    let deco = ProseMirrorView.Decoration.inline(tagPos.from, tagPos.to, attributes, spec); 

                    newDecos.push(deco);
                }
            }
            
            console.log("for delete", decosForBlock.concat());
            console.log("for adding", newDecos.concat());
            
            this.decos = this.decos.remove(decosForBlock).add(this.doc, newDecos);
            
            this.applyDecoUpdateTransaction();
        }
    }
    
    //private 

    getHighlightInfo(uid:string):HighlightInfo {
        let decos = this.decos;
        if (decos) {
            let deco = this.getDecoById(uid);
            if (deco){
                return <HighlightInfo>deco.spec.highlightInfo;
            }
        }
        return null;
    }

    clearMarks(skipIgnored:boolean):void {
        if (skipIgnored) {
            //find not ignored decos and remove only it
            let notIgnoredDecos = this.decos.find(undefined, undefined, (spec:HighlightSpec)=>!spec.ignored);
            this.decos = this.decos.remove(notIgnoredDecos);
        }else {
            this.decos = DecorationSet.empty;
        }
        this.applyDecoUpdateTransaction();
    }

    ignore(uid:string):void {
        let deco = this.getDecoById(uid);
        
        //getting old spec, marking it as ignored and creating from it new ignored deco
        let spec = <HighlightSpec>deco.spec;
        spec.ignored = true;
        
        let new_deco = ProseMirrorView.Decoration.inline(deco.from, deco.to, createDecorationAttributesFromSpec(spec), spec);
        
        this.decos = this.decos.remove([deco]).add(this.doc, [new_deco]);
        
        this.applyDecoUpdateTransaction();
    }

    omit(uid:string):void {
        let deco = this.getDecoById(uid);
        if (deco){
            //creating new transaction with delete operation
            let tr = this.editorView.state.tr;
            tr.delete(deco.from, deco.to);
            
            //remove non-actual deco
            this.decos = this.decos.remove([deco]);
            
            //applying transaction and updating view
            let newState = this.editorView.state.apply(tr);
            this.editorView.updateState(newState);
        }
    }

    accept(uid:string, suggestion:string):void {
        let deco = this.getDecoById(uid);
        if (deco){
            this.decos = this.decos.remove([deco]);
            let tr = this.editorView.state.tr;
            //let slice = new Slice();
            tr.replace(deco.from, deco.to);
            tr.insertText(suggestion);
            this.editorView.state.applyTransaction(tr);
            this.applyDecoUpdateTransaction();
        }
    }

    onAddToDictionary(uid:string):void {
        let deco = this.getDecoById(uid);
        if (deco) {
            let specToAdd: HighlightSpec = <HighlightSpec>deco.spec;
            let decosToRemove = this.decos.find(null, null, (spec) => {
                if ((<HighlightSpec>spec).tag.category == specToAdd.tag.category){
                    if ((<HighlightSpec>spec).highlightInfo.word==specToAdd.highlightInfo.word){
                        return true;
                    }
                }
                return false;
            });
            this.decos=this.decos.remove(decosToRemove);
            this.applyDecoUpdateTransaction();
        }
    }

    applyThesaurus(replacement:string):void {
        //TODO
    }

    getText(blockElement:HTMLElement):string {
        let node = <ProseMirrorModel.Node>(<any>blockElement);
        return node.textContent;
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

    getCurrentErrorCount():number {
        return this.decos.find().length;
    }

    private applyDecoUpdateTransaction(process ?: (tr:Transaction)=>void){
        let tr = this.editorView.state.tr;
        tr.setMeta(PWA_DECO_UPDATE_META,true);
        //this.decos.map(tr.mapping, this.doc);
        process && process(tr);
        let newState = this.editorView.state.apply( tr );
        this.editorView.updateState(newState);
    }

    private getPositionInDocument(theNode: ProseMirrorModel.Node): number{
        let pos = 0;
        let finished = false;
        this.doc.descendants((node)=>{
            if (finished){
                return false;
            }
            
            // each node has an index, we should to count it too
            pos++;
            if ( node.isTextblock ){
                if (node.eq(theNode)){
                    finished=true;
                } else {
                    // count add nodeSize instead of textContent.length, as it contains additional `indexes`, 
                    // but need to remove 1 as it is already included in nodeSize
                    pos += node.nodeSize - 1;
                }
                return false;
            }
            return true;
        });
        return pos;
    }

    // noinspection JSMethodCanBeStatic
    private rangeFromTransform(tr: Transaction): DocRange {
        let from, to;
        for (let i = 0; i < tr.steps.length; i++) {
            let step = <any>tr.steps[i],
                map = step.getMap();
            let stepFrom = map.map(step.from || step.pos, -1);
            let stepTo = map.map(step.to || step.pos, 1);
            from = from ? map.map(from, -1).pos.min(stepFrom) : stepFrom;
            to = to ? map.map(to, 1).pos.max(stepTo) : stepTo;
        }
        return new DocRange( from, to );
    }

    private getDecoById(uuid: string):Decoration{
        let decos = this.decos.find(null,null,spec=>(<HighlightSpec>spec).id == uuid);
        return decos[0];
    }

    /**
     * Methods stubbed for awhile
     */
    
    bindEditable():void { }

    unbindEditable():void { }

    bindChangeEvents():void { }

    unbindChangeEvents():void { }
    
    updateAfterPaste():void { }

    resetSpellCheck():void { }

    restoreSpellCheck():void { }

}

//Extending BeyondGrammar namespace
window["BeyondGrammar"] = window["BeyondGrammar"] || {};
window["BeyondGrammar"].createBeyondGrammarPluginSpec = createBeyondGrammarPluginSpec;