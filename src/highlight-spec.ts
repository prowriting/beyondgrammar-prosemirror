import {HighlightInfo, Tag} from "./interfaces/editable-wrapper";
import {uuid} from "./utils/uuid";

export class HighlightSpec{
    id: string;
    highlightInfo: HighlightInfo;
    inclusiveStart: boolean = true;
    inclusiveEnd: boolean = true;
    
    constructor(public tag: Tag, public word : string, public ignored : boolean = false){
        this.id = 'pwa-' + uuid();
        
        this.highlightInfo = new HighlightInfo();
        this.highlightInfo.category=tag.category;
        this.highlightInfo.hint=tag.hint;
        this.highlightInfo.suggestions=tag.suggestions;
        this.highlightInfo.word = word;
    }
}