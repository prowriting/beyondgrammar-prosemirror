/**
 * Generates unique id
 * @return {string}
 */
export function uuid_() {
    let res = '';

    for (let i = 0; i < 32; i++) {
        res += Math.floor(Math.random() * 16).toString(16).toUpperCase();
    }

    return res;
}