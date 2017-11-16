export function getWindow(el: Node){
    if( document == el.ownerDocument  ) {
        return window
    }
    let doc = el.ownerDocument || document;
    return doc.defaultView || (<any>doc).parentWindow;
}