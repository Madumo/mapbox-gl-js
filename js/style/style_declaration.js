'use strict';

var parseCSSColor = require('csscolorparser').parseCSSColor;
var ColorOps = require('color-ops');
var MapboxGLFunction = require('mapbox-gl-function');
var util = require('../util/util');

module.exports = StyleDeclaration;

function StyleDeclaration(reference, value) {
    this.type = reference.type;
    this.transitionable = reference.transition;

    // immutable representation of value. used for comparison
    this.json = JSON.stringify(value);

    if (this.type === 'color') {
        this.value = parseColor(value);
    } else {
        this.value = value;
    }

    this.calculate = MapboxGLFunction(this.value);

    if (reference.function === 'discrete' && reference.transition) {
        this.calculate = transitioned(this.calculate);
    }
}

function transitioned(calculate) {
    return function(values, zh, duration) {
        var z = values.$zoom;
        var fraction = z % 1;
        var t = Math.min((Date.now() - zh.lastIntegerZoomTime) / duration, 1);
        var fromScale = 1;
        var toScale = 1;
        var mix, from, to;

        if (z > zh.lastIntegerZoom) {
            mix = fraction + (1 - fraction) * t;
            fromScale *= 2;

            from = calculate({$zoom: z - 1})({});
            to = calculate({$zoom: z})({});
        } else {
            mix = 1 - (1 - t) * fraction;
            to = calculate({$zoom: z})({});
            from = calculate({$zoom: z + 1})({});
            fromScale /= 2;
        }

        return function() {
            return {
                from: from,
                fromScale: fromScale,
                to: to,
                toScale: toScale,
                t: mix
            };
        };
    };
}

var colorCache = {};
function parseColor(input) {

    var output;
    if (colorCache[input]) {
        return colorCache[input];

    // RGBA array
    } else if (Array.isArray(input) && typeof input[0] === 'number') {
        return input;

    // GL function
    } else if (MapboxGLFunction.is(input)) {
        return util.extend({}, input, {range: input.range.map(parseColor)});

    // CSS color string
    } else if (isString(input)) {
        output = colorDowngrade(parseCSSColor(input));

    // color operation array
    } else if (Array.isArray(input)) {
        var op = input[0];
        var degree = input[1];
        input[2] = colorUpgrade(parseColor(input[2]));

        if (op === 'mix') {
            input[3] = colorUpgrade(parseColor(input[3]));
            output = colorDowngrade(ColorOps[op](input[2], input[3], degree));
        } else {
            output = colorDowngrade(ColorOps[op](input[2], degree));
        }
    }

    colorCache[input] = output;
    return output;
}

function colorUpgrade(color) {
    return [color[0] * 255, color[1] * 255, color[2] * 255, color[3] * 1];
}

function colorDowngrade(color) {
    return [color[0] / 255, color[1] / 255, color[2] / 255, color[3] / 1];
}

function isString(value) {
    return typeof value === 'string' || value instanceof String;
}
