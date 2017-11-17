import {
    BGOptions, IEditableWrapper,
    HighlightInfo, Tag, ThesaurusData, BeyondGrammarModule
} from "./interfaces/editable-wrapper";
import {PluginSpec, Transaction} from "prosemirror-state";
import {Decoration, DecorationSet, EditorProps, EditorView} from "prosemirror-view";
import * as ProseMirrorView  from 'prosemirror-view';
import * as ProseMirrorModel from 'prosemirror-model';
import * as $ from "jquery";
import {HighlightSpec} from "./highlight-spec";
import {createDecorationAttributesFromSpec, objectAssign} from "./utils";
import {getWindow, loadBeyondGrammarModule} from "./utils/dom";

export const CSS_IGNORED = 'pwa-mark-ignored';
const PWA_DECO_UPDATE_META = 'pwa-deco-update';

export function createBeyondGrammarPluginSpec(pm, element : HTMLElement, bgOptions ?: BGOptions ) {
    const DEFAULT_SETTINGS : BGOptions = {
        grammar : {},
        service : {
            sourcePath : "//prowriting.azureedge.net/beyondgrammar/1.0.176/dist/bundle.js"
        }
    };
    
    bgOptions.grammar = objectAssign( DEFAULT_SETTINGS.grammar, bgOptions.grammar);
    bgOptions.service = objectAssign( DEFAULT_SETTINGS.service, bgOptions.service);
    
    let $element = $(element);
    let $contentEditable = $element.find("[contenteditable]");
    let plugin = new BeyondGrammarProseMirrorPlugin($element);
    
    loadBeyondGrammarModule(bgOptions.service.sourcePath, (bgModule : BeyondGrammarModule)=>{
        bgModule.loadPwaMarkStyles(window);
        
        let grammarChecker = new bgModule.GrammarChecker($contentEditable[0], bgOptions.service, bgOptions.grammar, plugin);
        grammarChecker.init().then(()=>{
           grammarChecker.activate();
           plugin.bgModule  = bgModule;
        });
    });
    
    return plugin;
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
    //Outside set data
    bgModule:BeyondGrammarModule;
    editorView: ProseMirrorView.EditorView;
    
    //Wrapper Callbacks 
    onShowThesaurus: (thesaurusData: ThesaurusData, contextWindow: Window) => boolean;
    onBlockChanged: (block: HTMLElement) => void;
    onPopupClose: () => void;
    onPopupDeferClose: () => void;
    onCheckRequired: () => void;
    onShowPopup: (uid: string, elem: Element) => void;

    
    private isBound : boolean = false;
    private _state : any;
    private _props : EditorProps;
    private decos : DecorationSet;
    private doc : ProseMirrorModel.Node;
    private lastThesaurusData_ : ThesaurusData;
    
    constructor( private $element_ : JQuery ){
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
                
                //console.log("apply value=", pluginState);
                
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
                                //console.info("onBlockChanged", elem);
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
        let self = this;
        this._props = {
            decorations(state) { return this.spec.decos },
            handleDoubleClick(view:EditorView, n : number, p:MouseEvent){
                if( !self.isBound ){
                    return true;
                }
                
                setTimeout(()=>{
                    self.processShowContextualThesaurus(null);
                }, 10);
                
                return false;
            }
        }
    }

    protected processShowContextualThesaurus($target : JQuery ) : boolean{
        if( !this.onShowThesaurus ) return false;

        let thesaurusData = this.bgModule.getThesaurusData(getWindow(this.$element_[0]), this.$element_, $target, true);

        this.lastThesaurusData_ = thesaurusData;
        
        return this.onShowThesaurus( thesaurusData, getWindow(this.$element_[0]))
    }
    
    get state(): any {
        return this._state;
    }

    get props() : any{
        return this._props;
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
            let tr = this.editorView.state.tr;
            this.decos = this.decos.remove([deco]);
            tr
                .replace(deco.from, deco.to)
                .insertText(suggestion, deco.from);

            let newState = this.editorView.state.apply(tr);
            this.editorView.updateState(newState);
        }
    }

    onAddToDictionary(uid:string):void {
        let deco = this.getDecoById(uid);
        if (deco) {
            let specToAdd: HighlightSpec = <HighlightSpec>deco.spec;
            let decosToRemove = this.decos.find(null, null, (spec : HighlightSpec) => {
                return spec.tag.category == specToAdd.tag.category && spec.highlightInfo.word == specToAdd.highlightInfo.word;
            });
            this.decos = this.decos.remove(decosToRemove);
            this.applyDecoUpdateTransaction();
        }
    }

    applyThesaurus(replacement:string):void {
        let tr = this.editorView.state.tr;
        tr.insertText(replacement, tr.selection.from, tr.selection.from + this.lastThesaurusData_.word.length);
        let newState = this.editorView.state.apply(tr);
        this.editorView.updateState(newState);        
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
        //console.group("rangeFromTransform");
        for (let i = 0; i < tr.steps.length; i++) {
            let step = <any>tr.steps[i];
            
            let stepMapping = step.getMap(); 
            
            //new position after step
            let stepFrom = stepMapping.map(step.from || step.pos, -1);
            let stepTo = stepMapping.map(step.to || step.pos, 1);
            
            //console.log(step);
            //console.log("=>", step.from, step.pos);
            //console.log("=>", step.to, step.pos);
            //console.log("steps", stepFrom, stepTo);
            
            if( from ) {
                //console.log("from", stepMapping.map(from, -1), stepFrom);
                from = Math.min( stepMapping.map( from, -1 ), stepFrom );
            } else {
                from = stepFrom;
                //console.log("from", stepFrom)
            }
            
            if( to ) {
                //console.log("to", stepMapping.map(to, 1), stepTo);
                to = Math.max( stepMapping.map(to, 1), stepTo );    
            } else {
                to = stepTo;
                //console.log("to", stepFrom)
            }
        }
        console.groupEnd();
        
        return new DocRange( from, to );
    }

    private getDecoById(uuid: string):Decoration{
        let decos = this.decos.find(null,null,spec=>(<HighlightSpec>spec).id == uuid);
        return decos[0];
    }

    /**
     * Methods stubbed for awhile
     */
    
    bindEditable():void {
        this.isBound = true;
    }

    unbindEditable():void {
        this.isBound = false;
    }

    bindChangeEvents():void { }

    unbindChangeEvents():void { }
    
    updateAfterPaste():void { }

    resetSpellCheck():void { }

    restoreSpellCheck():void { }
}

//Extending BeyondGrammar namespace
window["BeyondGrammar"] = window["BeyondGrammar"] || {};
window["BeyondGrammar"].createBeyondGrammarPluginSpec = createBeyondGrammarPluginSpec;