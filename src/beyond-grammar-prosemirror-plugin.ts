///<reference path="../prosemirror.d.ts"/>
import {ExternalProseMirror} from "../prosemirror";

import {
    BGOptions,
    IEditableWrapper,
    HighlightInfo,
    Tag,
    ThesaurusData,
    BeyondGrammarModule,
    INodeWrapper,
    MouseXY,
    ThrottledFunction,
    Rectangle,
    SELECTOR_ALL_HIGHLIGHTS_EXCLUDE_IGNORED
} from "./interfaces/editable-wrapper";

import {Node as PMNode} from "@types/prosemirror-model";
import {EditorState, PluginSpec, StateField, Transaction} from "@types/prosemirror-state";
import {EditorView, EditorProps, DecorationSet, Decoration} from "@types/prosemirror-view";

import * as $ from "jquery";
import {HighlightSpec} from "./highlight-spec";
import {createDecorationAttributesFromSpec, nodeAfterRange, nodeSetCursor, objectAssign} from "./utils";
import {DocRange_, getWindow_, loadBeyondGrammarModule_} from "./utils/dom";


const CSS_IGNORED_ = 'pwa-mark-ignored';
const PWA_DECO_UPDATE_META_ = 'pwa-deco-update';

export function createBeyondGrammarPluginSpec_(PM : ExternalProseMirror, element : HTMLElement, bgOptions ?: BGOptions ) {
    const DEFAULT_SETTINGS : BGOptions = {
        grammar : {},
        service : {
            sourcePath : "//cdn.prowritingaid.com/beyondgrammar/2.0.2893/dist/hayt/bundle.js"
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
    editorView: EditorView;
    
    //Wrapper Callbacks 
    onShowThesaurus: (thesaurusData: ThesaurusData, mouse:MouseXY, contextWindow: Window) => boolean;
    onBlockChanged: (block: HTMLElement) => void;
    onPopupClose: () => void;
    onPopupDeferClose: () => void;
    onCheckRequired: () => void;
    onShowPopup: (uid: string, elem: Element, mouseXY : MouseXY, preventCloseByMouseLeave ?: boolean)=>void;

    
    private isBound_ : boolean = false;
    private state_   : StateField<any>;
    private props_   : EditorProps;
    private decos_   : DecorationSet;
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
        
        this.$element_.on('mouseover touchend', `.pwa-mark:not(.${CSS_IGNORED_})`, (evt: JQueryEventObject) => {
            let elem = evt.target,
                uid = elem.getAttribute('data-pwa-id');

            if (this.onShowPopup){
                let mouse : MouseXY = [evt.clientX, evt.clientY];
                this.onShowPopup(uid, elem, mouse);
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
        this.decos_ = self.PM_.view.DecorationSet.empty;
        
        // noinspection JSUnusedLocalSymbols
        this.state_ = {
            init(config, state){
                // we should start the checker
                //self.onCheckRequired();
                // we do nothing here
                self.doc_= state.doc;
                //console.log(self.doc);
                return {decos : self.decos_};
            },
            
            apply( tr : Transaction, pluginState, old : EditorState, newState : EditorState ) {
                
                //console.log("apply value=", pluginState);
                
                //storing new doc, as it was changed after transactions
                self.doc_ = newState.doc;
                
                if (tr.docChanged) {
                    // I think we need to update our decos using the mapping of
                    // the transaction. This should update all the from and tos
                    
                    //As I understand it makes sense only if content was changed, in other case it is not necessary
                    self.decos_ = self.decos_.map(tr.mapping, self.doc_);
                    self.decos_ = self.invalidateDecorations_(self.decos_);
                }
                
                if (tr.docChanged) {
                    self.onDocChangedTransaction_(tr);
                }
                
                return { decos : self.decos_ };
            }
        }
    }
    
    onDocChangedTransaction_(tr : Transaction ){
        // get the range that is affected by the transformation
        let range = this.rangeFromTransform_(tr);

        // update all the blocks that have been affected by the transformation
        this.doc_.nodesBetween(range.from, range.to, (elem, pos) => {
            if (elem.isTextblock) {
                if (this.onBlockChanged) {
                    //console.info("onBlockChanged", elem);
                    this.onBlockChanged(<any>this.wrapNode_(elem, pos));
                }
                return false;
            }
            return true;
        });

        // set off a check
        if (this.onCheckRequired) {
            this.onCheckRequired();
        }
    }
    
    initProps_() {
        let self = this;
        this.props_ = {
            decorations() { return this.spec.decos_ },
            attributes : { spellcheck : "false" },
            handleDoubleClick(){
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

        //TODO MouseXY
        return this.onShowThesaurus( thesaurusData, [0, 0], getWindow_(this.$element_[0]))
    }
    
    get state(): StateField<any>{
        return this.state_;
    }

    get props() : EditorProps{
        return this.props_;
    }

    invalidateDecorations_(decos : DecorationSet) : DecorationSet{
        let changed = decos
            .find()
            .filter((deco:Decoration)=> this.doc_.textBetween(deco.from, deco.to) != (<HighlightSpec>deco.spec).word);
        return changed.length == 0 ? decos : decos.remove(changed);
    }
    
    applyHighlightsSingleBlock(elem:HTMLElement | INodeWrapper, text:string, tags:Tag[], ignoreSelectors : string[], removeExisting:boolean):void {

        // problem is PM is in most cases immutable, so if we started checking on one node, will type something
        // in dom we will have another node, but as we have it returned from closure this node can be 
        // incorrect(removed from dom structure). So we should make checking by existing checked element
        // not it's content or text, as it is in dom, that means it is not changed, if it is not in dom, that
        // means it is not actual and we can skip check result.

        //unwrapping element, as elem is result of wrapNode method
        //store textContent as tag positions related to it
        let {node, textContent} = <INodeWrapper>elem;
        
        let found = false;
        this.doc_.descendants((n:PMNode)=>{
            if( node == n ) {
                found = true;
            }
            return !found;
        });
        
        if(!found) return; //nothing to do

        let start = this.getPositionInDocument_(node);
        let length = text.length;
        // find the decos from the start and end of this element and remove them
        let decosForBlock = this.decos_.find(start,start + length);
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
                let word = textContent.substring(tag.startPos, tag.endPos+1);
                let spec = new HighlightSpec(tag, word);
                let attributes = createDecorationAttributesFromSpec(spec);

                let deco = this.PM_.view.Decoration.inline(tagPos.from, tagPos.to, attributes, spec);

                newDecos.push(deco);
            }
        }

        this.decos_ = this.decos_.remove(decosForBlock).add(this.doc_, newDecos);

        this.applyDecoUpdateTransaction_();
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
        
        if( deco ) {
            this.applyDecoUpdateTransaction_(()=>{
                //getting old spec, marking it as ignored and creating from it new ignored deco
                let spec = <HighlightSpec>deco.spec;
                spec.ignored = true;

                let new_deco = this.PM_.view.Decoration.inline(deco.from, deco.to, createDecorationAttributesFromSpec(spec), spec);

                this.decos_ = this.decos_.remove([deco]).add(this.doc_, [new_deco]);
                return deco.to;
            });
        }
    }

    omit(uid:string):void {
        let deco = this.getDecoById_(uid);
        if (deco){
            this.applyDecoUpdateTransaction_((tr:Transaction)=>{
                tr.delete(deco.from, deco.to);
                this.decos_ = this.decos_.remove([deco]);
                return deco.from;
            });
        }
    }

    accept(uid:string, suggestion:string):void {
        let deco = this.getDecoById_(uid);
        if (deco){
            this.applyDecoUpdateTransaction_((tr:Transaction)=>{
                //let tr = this.editorView.state.tr;
                this.decos_ = this.decos_.remove([deco]);
                tr
                    .replace(deco.from, deco.to)
                    .insertText(suggestion, deco.from);
                return deco.from + suggestion.length;
            });
        }
    }

    onAddToDictionary(uid:string):void {
        let deco = this.getDecoById_(uid);
        if (deco) {
            this.applyDecoUpdateTransaction_(()=>{
                let specToAdd: HighlightSpec = <HighlightSpec>deco.spec;
                let decosToRemove = this.decos_.find(null, null, (spec : HighlightSpec) => {
                    return spec.tag.category == specToAdd.tag.category && spec.word == specToAdd.word;
                });
                this.decos_ = this.decos_.remove(decosToRemove);
                return deco.to;
            });
        }
    }

    applyThesaurus(replacement:string):void {
        this.applyDecoUpdateTransaction_((tr : Transaction)=>{
            tr.insertText(replacement, tr.selection.from, tr.selection.from + this.lastThesaurusData_.word.length);
            return tr.selection.from + this.lastThesaurusData_.word.length;
        });    
    }

    getText(blockElement:HTMLElement):string {
        let node = <PMNode>(<any>blockElement);
        return node.textContent;
    }
    
    getAllElements():HTMLElement[] {
        let result = [];
        this.doc_.descendants((node, pos)=>{
            if (node.isTextblock){
                result.push( <any>this.wrapNode_( node, pos) );
                return false;
            }
            return true;
        });
        return result;
    }
    
    private wrapNode_(node : PMNode, pos : number) : INodeWrapper{
        // we should re-write text content, as in real case textContent of DOM can't contains images and unsized elements
        // but PM can do this. So it's text block can contains images, so when we getting textContent we skips images
        // and broken indexed after image when adding highlights
        return {
            node : node,
            textContent : this.doc_.textBetween( pos, pos + node.nodeSize, "\n", "\n" )
        }
    }

    getCurrentErrorCount():number {
        return this.decos_.find().length;
    }

    private applyDecoUpdateTransaction_(process ?: (tr:Transaction)=>number ){
        let state = this.editorView.state;
        const tr = state.tr.setMeta(PWA_DECO_UPDATE_META_, true);
        
        const cursorPosition = process ? process(tr) : -1;

        // Update state (doc) before setting selection, otherwise ProseMirror complains:
        // - Selection passed to setSelection must point at the current document
        state = state.apply(tr);
        
        if( cursorPosition != -1 ){
            state = state.apply(
                state.tr.setSelection(this.PM_.state.TextSelection.create(this.doc_, cursorPosition))
            );
        }
        
        this.editorView.updateState(state);
        
        if( cursorPosition != -1 ){
            this.editorView.focus();
        }
    }

    private getPositionInDocument_(theNode: PMNode): number{
        let pos = 0;
        let finished = false;
        this.doc_.descendants((node, p)=>{
            if (finished){
                return false;
            }
            
            if( node.eq( theNode )) {
                pos = p + 1;
                finished = true;
                return false;
            }
            
            return true;
        });
        return pos;
    }

    // noinspection JSMethodCanBeStatic
    private rangeFromTransform_(tr: Transaction): DocRange_ {
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

    private getDecoById_(uuid: string):Decoration{
        let decos = this.decos_.find(null,null,spec=>(<HighlightSpec>spec).id == uuid);
        return decos[0];
    }

    jumpToNextHighlight() {
        let elem = <HTMLElement>this.nextHighlight();

        if( elem ){
            let uid = elem.getAttribute('data-pwa-id');
            this.scrollToHighlight(elem);

            if (this.onShowPopup) {
                this.onShowPopup(uid, elem, [1, 1], true);
            }
        }
    }

    nextHighlight(): HTMLElement {
        let doc = getWindow_(this.$element_[0]).document;
        let selection = doc.getSelection();
        if( !selection || selection.rangeCount == 0) {
            return;
        }

        let selectionRange = selection.getRangeAt(0).cloneRange();

        return <HTMLElement>nodeAfterRange(
            selectionRange,
             this.$element_
                .find(SELECTOR_ALL_HIGHLIGHTS_EXCLUDE_IGNORED)
                .toArray(),
            this.$element_[0]
        );
    }

    scrollToHighlight(elem: HTMLElement) {
        nodeSetCursor(elem, true);
        elem.blur();
        elem.focus();
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

    updateActiveSelection() {}// ????

    prevHighlight(): HTMLElement { return undefined;}

    getAllMarks(): HTMLElement[] { return []; }

    getContainer(): HTMLElement { return undefined; }

    bindChangeEvents():void { }

    unbindChangeEvents():void { }
    
    updateAfterPaste():void { }

    resetSpellCheck():void { }

    restoreSpellCheck():void { }

    addHoveredClass($highlight : JQuery){}
    removeHoveredClass($highlight : JQuery){}

    getActiveHighlightUid: () => (string | null);//skip
    notifyCursorPositionChanged: ThrottledFunction;//skip
    onPopupClosed: () => void; //skip
    getHtml(): string {return "";} //skip
    setHtml(html: string): void {} //skip
    getCursorScreenPosition(): Rectangle {return {left : 0, top : 0, width : 0, height : 0};} //skip
}

//Extending BeyondGrammar namespace
window["BeyondGrammar"] = window["BeyondGrammar"] || {};
window["BeyondGrammar"].createBeyondGrammarPluginSpec = createBeyondGrammarPluginSpec_;
