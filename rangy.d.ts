type NodePosition = {node: Node, start: number, end: number}

type TextAndMap = {
    text: string;
    map: Array<NodePosition>
};

type CharacterOptions = {
    includeBlockContentTrailingSpace?: boolean;
    includeSpaceBeforeBr? : boolean;
    includePreLineTrailingSpace? : boolean;
    includeTrailingSpace?: boolean;
    ignoreCharacters? : boolean;
    ignoreTagNames? : {[key: string] : boolean};
    rootElement? : HTMLElement;
}

interface TextRange {
    textAndMap(characterOptions?: CharacterOptions): TextAndMap;
    text(characterOptions?: CharacterOptions): string;
    pasteHtml(html : string);
}

interface ClassApplier{
    elementAttributes : {[key: string] : string | number | boolean};
    elementProperties : {[key: string] : any};
    applyToRange(range: Range);
    undoToRange(range : Range);
    isAppliedToRange(range : Range): boolean;
}

interface RangyRange extends Range, TextRange {
    selectCharacters(containerNode: Node, startIndex:number, endIndex:number);
    setStartAndEnd(startNode: Node, startOffset: number, endNode?: Node, endOffset?: number): any;
    setStartAndEnd(startNode: Node, startOffset: number, endOffset: number): any;
    getNodes(nodeTypes: number[]): Node[];
    selectNodeContents(element: HTMLElement);
    moveEnd(unit : "word"|"character", count : number, opts ?:any );
    moveStart(unit : "word"|"character", count : number, opts ?:any );
    cloneRange():RangyRange;
    isValid() : boolean;
    nativeRange : Range;
    isValid():boolean;
}

interface RangySelection extends Selection{
    setSingleRange(range: Range);
}

interface RangyStatic extends TextRange {
    init();
    createRange(win?:Window): RangyRange;
    createClassApplier(theClass : string, options? : any): ClassApplier;
    getSelection(win?: Window): RangySelection;
    saveSelection(win?: Window): Object;
    restoreSelection(sel: Object);
}

declare var rangy: RangyStatic;

declare module "rangy" {
    export = rangy;
}