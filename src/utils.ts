
//[pavel] Object assigning was stolen from :
//https://github.com/sindresorhus/object-assign/blob/master/index.js
import {Tag} from "./interfaces/editable-wrapper";
import {HighlightSpec} from "./highlight-spec";

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
        'data-pwa-dictionary-word' : spec.tag.text
    }
}