/**
 * Generates unique id
 * @return {string}
 */
export function uuid() {
    let res = '';

    for (var i = 0; i < 32; i++) {
        res += Math.floor(Math.random() * 16).toString(16).toUpperCase();
    }

    return res;
}