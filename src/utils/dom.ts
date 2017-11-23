import {BeyondGrammarModule} from "../interfaces/editable-wrapper";

export function getWindow_(el: Node){
    if( document == el.ownerDocument  ) {
        return window
    }
    let doc = el.ownerDocument || document;
    return doc.defaultView || (<any>doc).parentWindow;
}

export function loadBeyondGrammarModule_(src : string, onLoad ?: (module:BeyondGrammarModule)=> void){
    let script = document.createElement("script");
    script.src = src;//"bundle.js?r=" + Math.ceil(Math.random() * 1e6);
    (document.head || document.body).appendChild(script);

    let r = false;
    script.onload = script["onreadystatechange"] = function(){
        if ( !r && (!this.readyState || this.readyState == 'complete') )
        {
            r = true;
            onLoad && onLoad( module = window["BeyondGrammar"]);
        }
    }
}

export class DocRange_ {
    constructor(from: number, to: number){
        this.from=from;
        this.to=to;
    }
    from: number;
    to: number;
}