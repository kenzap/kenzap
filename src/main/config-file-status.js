'use strict';

const { isDeepStrictEqual } = require('util');
const LAST_APPLIED = 'kubectl.kubernetes.io/last-applied-configuration';
const SERVER_METADATA = ['uid', 'resourceVersion', 'generation', 'creationTimestamp', 'managedFields', 'selfLink', 'deletionTimestamp', 'deletionGracePeriodSeconds'];
const resourceKey = (resource, namespace) => `${resource.apiVersion.includes('/') ? resource.apiVersion.split('/')[0] : ''}/${resource.kind}/${(resource.metadata || {}).namespace || namespace}/${(resource.metadata || {}).name}`;

function quantity(value) {
    if (!['string', 'number'].includes(typeof value) || String(value).length > 64) return null;
    const match = String(value).match(/^([+-]?)(\d*(?:\.\d+)?)(n|u|m|k|M|G|T|P|E|Ki|Mi|Gi|Ti|Pi|Ei|[eE][+-]?\d+)?$/);
    if (!match || !match[2]) return null;
    const parts = match[2].split('.'), suffix = match[3] || '';
    const powers = { n: -9, u: -6, m: -3, k: 3, M: 6, G: 9, T: 12, P: 15, E: 18, '': 0 };
    const binary = { Ki: '1024', Mi: '1048576', Gi: '1073741824', Ti: '1099511627776', Pi: '1125899906842624', Ei: '1152921504606846976' };
    const exponent = Object.prototype.hasOwnProperty.call(powers, suffix) ? powers[suffix] : binary[suffix] ? 0 : Number(suffix.slice(1));
    if (!Number.isInteger(exponent) || Math.abs(exponent) > 64) return null;
    let numerator = BigInt(match[1] + (parts[0] || '0') + (parts[1] || ''));
    let denominator = BigInt('1' + '0'.repeat((parts[1] || '').length));
    if (binary[suffix]) numerator *= BigInt(binary[suffix]);
    if (exponent >= 0) numerator *= BigInt('1' + '0'.repeat(exponent));
    else denominator *= BigInt('1' + '0'.repeat(-exponent));
    let a = numerator < BigInt(0) ? -numerator : numerator, b = denominator;
    while (b) { const remainder = a % b; a = b; b = remainder; }
    return String(numerator / a) + '/' + String(denominator / a);
}

function normalizeQuantities(value, depth = 0) {
    if (!value || typeof value !== 'object' || depth > 64) return;
    for (const type of ['requests', 'limits']) {
        const resources = value.resources && value.resources[type];
        if (resources && typeof resources === 'object') for (const key of Object.keys(resources)) {
            const canonical = quantity(resources[key]);
            if (canonical !== null) resources[key] = 'quantity:' + canonical;
        }
    }
    for (const child of Object.values(value)) normalizeQuantities(child, depth + 1);
}

function normalized(resource, namespace) {
    const value = JSON.parse(JSON.stringify(resource));
    delete value.status;
    value.metadata = value.metadata || {};
    value.metadata.namespace = value.metadata.namespace || namespace;
    for (const field of SERVER_METADATA) delete value.metadata[field];
    if (value.metadata.annotations) {
        delete value.metadata.annotations[LAST_APPLIED];
        if (!Object.keys(value.metadata.annotations).length) delete value.metadata.annotations;
    }
    if (value.metadata.labels && !Object.keys(value.metadata.labels).length) delete value.metadata.labels;
    if (value.kind === 'Secret' && value.stringData) {
        value.data = { ...(value.data || {}) };
        for (const [name, text] of Object.entries(value.stringData)) value.data[name] = Buffer.from(String(text)).toString('base64');
        delete value.stringData;
    }
    normalizeQuantities(value);
    return value;
}

// Compare declared fields, allowing API defaults and injected named sidecars.
function includesFields(live, desired, depth = 0) {
    if (depth > 64) return false;
    if (desired === null || typeof desired !== 'object') return live === desired;
    if (!live || typeof live !== 'object') return false;
    if (Array.isArray(desired)) {
        if (!Array.isArray(live)) return false;
        const named = desired.length && desired.every(item => item && typeof item.name === 'string');
        return named ? desired.every(item => includesFields(live.find(candidate => candidate && candidate.name === item.name), item, depth + 1))
            : desired.length === live.length && desired.every((item, index) => includesFields(live[index], item, depth + 1));
    }
    return Object.keys(desired).every(key => desired[key] === null && !Object.prototype.hasOwnProperty.call(live, key)
        || Object.prototype.hasOwnProperty.call(live, key) && includesFields(live[key], desired[key], depth + 1));
}

function resourceStatus(desired, live, namespace) {
    if (!live) return 'missing';
    if (live.metadata && live.metadata.deletionTimestamp) return 'removing';
    const local = normalized(desired, namespace), actual = normalized(live, namespace);
    if (!includesFields(actual, local)) return 'different';
    const annotation = ((live.metadata || {}).annotations || {})[LAST_APPLIED];
    if (typeof annotation !== 'string') return 'present';
    try {
        const previous = normalized(JSON.parse(annotation), namespace);
        return isDeepStrictEqual(previous, local) ? 'applied' : 'different';
    } catch (_) { return 'present'; }
}

function fileStatus(resources, liveResources, namespace) {
    const lookup = new Map(liveResources.map(resource => [resourceKey(resource, namespace), resource]));
    const counts = { total: resources.length, applied: 0, present: 0, missing: 0, different: 0, removing: 0 };
    for (const resource of resources) counts[resourceStatus(resource, lookup.get(resourceKey(resource, namespace)), namespace)]++;
    const status = !counts.total ? 'unknown' : counts.missing === counts.total ? 'not-applied' : counts.missing ? 'partial'
        : counts.removing ? 'removing' : counts.different ? 'changed' : counts.present ? 'present' : 'applied';
    return { status, counts };
}

module.exports = { fileStatus, resourceStatus, resourceKey };
