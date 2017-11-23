///<reference path="../prosemirror.d.ts"/>
import {ExternalProseMirror} from "../prosemirror";

import {
    BGOptions, IEditableWrapper,
    HighlightInfo, Tag, ThesaurusData, BeyondGrammarModule
} from "./interfaces/editable-wrapper";

import {Node as PMNode} from "@types/prosemirror-model";
import {PluginSpec, Transaction} from "@types/prosemirror-state";
//import {EditorView, EditorProps, DecorationSet, Decoration} from "@types/prosemirror-view";

import * as $ from "jquery";
import {HighlightSpec} from "./highlight-spec";
import {createDecorationAttributesFromSpec, objectAssign} from "./utils";
import {DocRange_, getWindow_, loadBeyondGrammarModule_} from "./utils/dom";


const CSS_IGNORED_ = 'pwa-mark-ignored';
const PWA_DECO_UPDATE_META_ = 'pwa-deco-update';

export function createBeyondGrammarPluginSpec_(PM : ExternalProseMirror, element : HTMLElement, bgOptions ?: BGOptions ) {
    const DEFAULT_SETTINGS : BGOptions = {
        grammar : {},
        service : {
            sourcePath : "//prowriting.azureedge.net/beyondgrammar/1.0.176/dist/bundle.js"
        }
    };
    
    bgOptions.grammar = objectAssign( DEFAULT_SETTINGS.grammar, bgOptions.grammar);
    bgOptions.service = objectAssign( DEFAULT_SETTINGS.service, bgOptions.service);
    
    let $element = $(element);
    let plugin = new BeyondGrammarProseMirrorPlugin($element, PM);
    
    loadBeyondGrammarModule_(bgOptions.service.sourcePath, (bgModule : BeyondGrammarModule)=>{
        bgModule.loadPwaMarkStyles(window);
        let $contentEditable = $element.find("[contenteditable]");
        let grammarChecker = new bgModule.GrammarChecker($contentEditable[0], bgOptions.service, bgOptions.grammar, plugin);
        grammarChecker.init().then(()=>{
           grammarChecker.activate(); 
           plugin.bgModule_  = bgModule;
        });
    });
    
    return plugin;
}

//idea to combine in one class two implementations: bg wrapper + pm plugin, so we can work in one scope
export class BeyondGrammarProseMirrorPlugin implements PluginSpec, IEditableWrapper{
    //Outside set data
    bgModule_:BeyondGrammarModule;
    editorView: any; //EditorView;//TODO
    
    //Wrapper Callbacks 
    onShowThesaurus: (thesaurusData: ThesaurusData, contextWindow: Window) => boolean;
    onBlockChanged: (block: HTMLElement) => void;
    onPopupClose: () => void;
    onPopupDeferClose: () => void;
    onCheckRequired: () => void;
    onShowPopup: (uid: string, elem: Element) => void;

    
    private isBound_ : boolean = false;
    private state_   : any;
    private props_   : any;//EditorProps;//TODO
    private decos_   : any;//DecorationSet;//TODO
    private doc_     : PMNode;
    private lastThesaurusData_ : ThesaurusData;
    
    constructor( private $element_ : JQuery, private PM_ : ExternalProseMirror){
        this.initState_();
        this.initProps_();
        this.bindEditableEvents_();
    }
    
    bindEditableEvents_() {
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
        this.$element_.on('mouseover touchend', `.pwa-mark:not(.${CSS_IGNORED_})`, (evt: JQueryEventObject) => {
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
    
    initState_() {
        let self = this;
        this.decos_ = self.PM_.view.DecorationSet.empty;//.create(this.doc, []);
        
        this.state_ = {
            init(config, state){
                // we should start the checker
                //self.onCheckRequired();
                // we do nothing here
                self.doc_= state.doc;
                //console.log(self.doc);
                return {decos : self.decos_};
            },
            
            apply( tr : Transaction, pluginState, old, newState ) { //TODO
                
                //console.log("apply value=", pluginState);
                
                //storing new doc, as it was changed after transactions
                self.doc_ = newState.doc;
                
                if (tr.docChanged) {
                    // I think we need to update our decos using the mapping of
                    // the transaction. This should update all the from and tos
                    
                    //storing new decos after mapping changes
                    self.decos_ = self.decos_.map(tr.mapping, self.doc_);
                    self.decos_ = self.invalidateDecorations_(self.decos_);

                    // get the range that is affected by the transformation
                    let range = self.rangeFromTransform_(tr);
                    
                    // update all the blocks that have been affected by the transformation
                    self.doc_.nodesBetween(range.from, range.to, (elem) => {
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
                if (tr.getMeta(PWA_DECO_UPDATE_META_)){
                    self.decos_ = self.decos_.map(tr.mapping, self.doc_);
                    return { decos : self.decos_ };
                }
                
                return { decos : self.decos_ };
            }
        }
    }
    
    initProps_() {
        let self = this;
        this.props_ = {
            decorations(state) { return this.spec.decos_ },
            attributes() { return { spellcheck : false } },
            handleDoubleClick(view: any/*EditorView*/, n : number, p:MouseEvent){//TODO
                if( !self.isBound_ ){
                    return true;
                }
                
                setTimeout(()=>{
                    self.processShowContextualThesaurus_(null);
                }, 10);
                
                return false;
            }
        }
    }

    protected processShowContextualThesaurus_($target : JQuery ) : boolean{
        if( !this.onShowThesaurus ) return false;

        let thesaurusData = this.bgModule_.getThesaurusData(getWindow_(this.$element_[0]), this.$element_, $target, true);

        this.lastThesaurusData_ = thesaurusData;
        
        return this.onShowThesaurus( thesaurusData, getWindow_(this.$element_[0]))
    }
    
    get state(): any {
        return this.state_;
    }

    get props() : any{
        return this.props_;
    }

    invalidateDecorations_(decos : any /*DecorationSet*/) : any{ //TODO
        let changed = decos
            .find()
            .filter((deco:any/*Decoration*/)=> this.doc_.textBetween(deco.from, deco.to) != (<HighlightSpec>deco.spec).word);
        return changed.length == 0 ? decos : decos.remove(changed);
    }
    
    /**
     * Implementations of IEditableWrapper
     */
    
    applyHighlightsSingleBlock(elem:HTMLElement, text:string, tags:Tag[], checkAll:boolean):void {
        
        let node = <PMNode><any>elem;
        if (text == node.textContent) {
            let start = this.getPositionInDocument_(node);
            let length = text.length;
            // find the decos from the start and end of this element and remove them
            let decosForBlock = this.decos_.find(start,start + length);
            
            let newDecos = [];
            for(let i = 0; i < tags.length; i++){
                let tag = tags[i];
                let tagPos = { from : tag.startPos + start, to : tag.endPos + start + 1 };
                let existing : any/*Decoration*/ = null;//TODO
                
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
                    
                    let deco = this.PM_.view.Decoration.inline(tagPos.from, tagPos.to, attributes, spec); 
                    
                    newDecos.push(deco);
                }
            }
            
            this.decos_ = this.decos_.remove(decosForBlock).add(this.doc_, newDecos);
            
            this.applyDecoUpdateTransaction_();
        }
    }
    
    getHighlightInfo(uid:string):HighlightInfo {
        let decos = this.decos_;
        if (decos) {
            let deco = this.getDecoById_(uid);
            if (deco){
                return <HighlightInfo>deco.spec.highlightInfo;
            }
        }
        return null;
    }

    clearMarks(skipIgnored:boolean):void {
        if (skipIgnored) {
            //find not ignored decos and remove only it
            let notIgnoredDecos = this.decos_.find(undefined, undefined, (spec:HighlightSpec)=>!spec.ignored);
            this.decos_ = this.decos_.remove(notIgnoredDecos);
        }else {
            this.decos_ = this.PM_.view.DecorationSet.empty;
        }
        this.applyDecoUpdateTransaction_();
    }

    ignore(uid:string):void {
        let deco = this.getDecoById_(uid);
        
        //getting old spec, marking it as ignored and creating from it new ignored deco
        let spec = <HighlightSpec>deco.spec;
        spec.ignored = true;
        
        let new_deco = this.PM_.view.Decoration.inline(deco.from, deco.to, createDecorationAttributesFromSpec(spec), spec);//TODO
        
        this.decos_ = this.decos_.remove([deco]).add(this.doc_, [new_deco]);
        
        this.applyDecoUpdateTransaction_();
    }

    omit(uid:string):void {
        let deco = this.getDecoById_(uid);
        if (deco){
            //creating new transaction with delete operation
            let tr = this.editorView.state.tr;
            tr.delete(deco.from, deco.to);
            
            //remove non-actual deco
            this.decos_ = this.decos_.remove([deco]);
            
            //applying transaction and updating view
            let newState = this.editorView.state.apply(tr);
            this.editorView.updateState(newState);
        }
    }

    accept(uid:string, suggestion:string):void {
        let deco = this.getDecoById_(uid);
        if (deco){
            let tr = this.editorView.state.tr;
            this.decos_ = this.decos_.remove([deco]);
            tr
                .replace(deco.from, deco.to)
                .insertText(suggestion, deco.from);

            let newState = this.editorView.state.apply(tr);
            this.editorView.updateState(newState);
        }
    }

    onAddToDictionary(uid:string):void {
        let deco = this.getDecoById_(uid);
        if (deco) {
            let specToAdd: HighlightSpec = <HighlightSpec>deco.spec;
            let decosToRemove = this.decos_.find(null, null, (spec : HighlightSpec) => {
                return spec.tag.category == specToAdd.tag.category && spec.highlightInfo.word == specToAdd.highlightInfo.word;
            });
            this.decos_ = this.decos_.remove(decosToRemove);
            this.applyDecoUpdateTransaction_();
        }
    }

    applyThesaurus(replacement:string):void {
        let tr = this.editorView.state.tr;
        tr.insertText(replacement, tr.selection.from, tr.selection.from + this.lastThesaurusData_.word.length);
        let newState = this.editorView.state.apply(tr);
        this.editorView.updateState(newState);        
    }

    getText(blockElement:HTMLElement):string {
        let node = <PMNode>(<any>blockElement);//TODO
        return node.textContent;
    }
    
    getAllElements():HTMLElement[] {
        let result = [];
        this.doc_.descendants((node)=>{
            if (node.isTextblock){
                result.push(node);
                return false;
            }
            return true;
        });
        return result;
    }

    getCurrentErrorCount():number {
        return this.decos_.find().length;
    }

    private applyDecoUpdateTransaction_(process ?: (tr:Transaction)=>void){//TODO
        let tr = this.editorView.state.tr;
        tr.setMeta(PWA_DECO_UPDATE_META_, true);
        process && process(tr);
        let newState = this.editorView.state.apply( tr );
        this.editorView.updateState(newState);
    }

    private getPositionInDocument_(theNode: PMNode): number{ //TODO
        let pos = 0;
        let finished = false;
        this.doc_.descendants((node)=>{
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
    private rangeFromTransform_(tr: Transaction): DocRange_ {//TODO
        let from, to;
        for (let i = 0; i < tr.steps.length; i++) {
            let step = <any>tr.steps[i];
            
            let stepMapping = step.getMap(); 
            
            //new position after step
            let stepFrom = stepMapping.map(step.from || step.pos, -1);
            let stepTo = stepMapping.map(step.to || step.pos, 1);
            
            if( from ) {
                from = Math.min( stepMapping.map( from, -1 ), stepFrom );
            } else {
                from = stepFrom;
            }
            
            if( to ) {
                to = Math.max( stepMapping.map(to, 1), stepTo );    
            } else {
                to = stepTo;
            }
        }
        
        return new DocRange_( from, to );
    }

    private getDecoById_(uuid: string):any/*Decoration*/{//TODO
        let decos = this.decos_.find(null,null,spec=>(<HighlightSpec>spec).id == uuid);
        return decos[0];
    } 

    /**
     * Methods stubbed for awhile
     */
    
    bindEditable():void {
        this.isBound_ = true;
    }

    unbindEditable():void {
        this.isBound_ = false;
    }

    bindChangeEvents():void { }

    unbindChangeEvents():void { }
    
    updateAfterPaste():void { }

    resetSpellCheck():void { }

    restoreSpellCheck():void { }
}

//Extending BeyondGrammar namespace
window["BeyondGrammar"] = window["BeyondGrammar"] || {};
window["BeyondGrammar"].createBeyondGrammarPluginSpec = createBeyondGrammarPluginSpec_;