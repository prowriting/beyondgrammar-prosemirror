
//[pavel] Object assigning was stolen from :
//https://github.com/sindresorhus/object-assign/blob/master/index.js
import {Tag} from "./interfaces/editable-wrapper";
import {HighlightSpec} from "./highlight-spec";
import {getWindow_} from "./utils/dom";

export function objectAssign(target, source, ...attr) {
    let getOwnPropertySymbols = Object['getOwnPropertySymbols'];
    let hasOwnProperty = Object.prototype.hasOwnProperty;
    let propIsEnumerable = Object.prototype.propertyIsEnumerable;
    
    let from;
    let to = toObject(target);
    let symbols;

    for (let s = 1; s < arguments.length; s++) {
        from = Object(arguments[s]);

        for (let key in from) {
            if (hasOwnProperty.call(from, key)) {
                to[key] = from[key];
            }
        }

        if (getOwnPropertySymbols) {
            symbols = getOwnPropertySymbols(from);
            for (let i = 0; i < symbols.length; i++) {
                if (propIsEnumerable.call(from, symbols[i])) {
                    to[symbols[i]] = from[symbols[i]];
                }
            }
        }
    }

    return to;
}

function toObject(val) {
    if (val === null || val === undefined) {
        throw new TypeError('Object.assign cannot be called with null or undefined');
    }

    return Object(val);
}

export function createDecorationAttributesFromSpec(spec : HighlightSpec) {
    // noinspection ReservedWordAsName
    return {
        class: `pwa-mark pwa-mark-done${spec.ignored?" pwa-mark-ignored":""}`,
        nodeName : "span",
        "data-pwa-id" : spec.id,
        'data-pwa-category': spec.tag.category.toLowerCase(),
        'data-pwa-hint': spec.tag.hint,
        'data-pwa-suggestions': spec.tag.suggestions.join("~"),
        'data-pwa-dictionary-word' : spec.tag.text,
        tabindex : '0'
    }
}

export function nodeAfterRange( srcRange : Range, nodes : Node[], container ?: Node, cycle : boolean = true ) : Node {
    container = container || document.body;

    let doc = getWindow_(container).document;
    for(let i = 0; i < nodes.length; i++){
        let range = doc.createRange();
        let node = nodes[i];
        range.selectNode(node);
        if ( srcRange.compareBoundaryPoints(Range.START_TO_START, range) <= 0) {
            return node;
        }
    }

    //case when we have at the end of all highlight and we can start from first node
    if( nodes.length && cycle){
        let range = doc.createRange();
        range.selectNode(container);
        range.collapse(true);
        return nodeAfterRange(range, nodes, container, cycle);
    }
    return null
}

export function nodeSetCursor(node : Node, after : boolean = true) {
    let doc = getWindow_(node).document;

    let range = doc.createRange();
    range.selectNodeContents(node);
    range.collapse(!after);

    let selection = doc.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
}
