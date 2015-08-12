"use strict";

/**
 * Trace data for one variable
 */
function TraceData(name, timestamps, values)
{
    if (timestamps.length != values.length) {
        throw new Error("Timestamps and values must have the same length");
    }

    this.name = name;

    var length = timestamps.length;

    this.length = length;

    this.timestamps = timestamps;
    this.values = values;

    this.minTimestamp = timestamps[0];
    this.maxTimestamp = timestamps[length - 1];
    this.duration = this.maxTimestamp - this.minTimestamp;

    var min = Infinity, max = -Infinity;

    var lastT = timestamps[0] - 1;
    for (var n = 0; n < length; n++) {
        var v = values[n];
        var t = timestamps[n];

        if (t < lastT) {
            throw new Error("Timestamps must be increasing");
        }
        lastT = t;

        if (v < min) { min = v; }
        if (v > max) { max = v; }
    }

    this.minValue = min;
    this.maxValue = max;
}

TraceData.fromCodesysTrace = function (doc, varIndex) {
    varIndex = varIndex || 0;

    var name = doc.evaluate("(//TraceVariable)[" + (varIndex + 1) + "]/@VarName", doc, null, XPathResult.STRING_TYPE, null).stringValue;

    var timestampsData = doc.evaluate("(//TraceVariable)[" + (varIndex + 1) + "]/Timestamps", doc, null, XPathResult.STRING_TYPE, null).stringValue.split(",");

    var length = timestampsData.length;

    var timestamps = new Float64Array(length);
    for (var n = 0; n < length; n++) {
        timestamps[n] = parseFloat(timestampsData[n]) * 1e-3;
    }

    var valuesData = doc.evaluate("(//TraceVariable)[" + (varIndex + 1) + "]/Values", doc, null, XPathResult.STRING_TYPE, null).stringValue.split(",");

    var values = new Float64Array(length);
    for (var n = 0; n < length; n++) {
        values[n] = parseFloat(valuesData[n]);
    }

    return new TraceData(name, timestamps, values);
};

TraceData.prototype = {};

/**
 * Finds the closest timestamp which is lower or equal to to the given
 * timestamp or -1 if there's no such timestamp
 */
TraceData.prototype.findTimestampIndex = function (t)
{
    var length = this.length;
    var timestamps = this.timestamps;

    var lower = 0;
    var upper = length - 1;

    while (upper >= lower) {
        var n = Math.floor((lower + upper) / 2);

        if (timestamps[n] <= t) {
            lower = n + 1;
        } else {
            upper = n - 1;
        }
    }

    return lower - 1;
};

/**
 * Resamples (decimate) the data. We try to include important details, so the
 * target length may be exceeded by a large amount (up to the original length).
 */
TraceData.prototype.resample = function (targetLength, lowerTimestamp, upperTimestamp) {

    lowerTimestamp = lowerTimestamp || this.minTimestamp;
    upperTimestamp = upperTimestamp || this.maxTimestamp;

    /* Step 1: find the bounding sample indices */
    var lowerIndex = this.findTimestampIndex(lowerTimestamp);
    var upperIndex = this.findTimestampIndex(upperTimestamp);

    if (lowerIndex < 0) {
        lowerIndex = 0;
    }

    var values = this.values.slice(lowerIndex, upperIndex);
    var timestamps = this.timestamps.slice(lowerIndex, upperIndex);

    var newTimestamps = [];
    var newValues = [];

    function absoluteDifference(a, b) {
        return (a > b) ? a - b : b - a;
    }

    var tolerance = 0.1 * absoluteDifference(Math.min.apply(null, values), Math.max.apply(null, values));

    var peaks = new Array(values.length);
    peaks[0] = 0;
    for (var i = 1; i < values.length; i++) {
        peaks[i] = absoluteDifference(values[i], values[i - 1]) > tolerance ? true : false;
    }

    var gap = Math.floor(values.length / targetLength);

    for (var i = 0; i < values.length; i++) {
        if (peaks[i] | i % gap == 0) {
            newValues.push(values[i]);
            newTimestamps.push(timestamps[i]);
        }
    }

    return new TraceData(this.name, newTimestamps, newValues);
};

TraceData.prototype.draw = function (ctx, width, height, color, lowerTimestamp, upperTimestamp)
{
    var data = this;

    lowerTimestamp = lowerTimestamp || data.minTimestamp;
    upperTimestamp = upperTimestamp || data.maxTimestamp;

    ctx.save();
    ctx.clearRect(0, 0, width, height);

    var radius = 1.5;

    // Provide the correct offset for the pixel center to avoid adding 0.5 all
    // the time
    ctx.translate(0.5, 0.5);

    // We want the dots to render fully, so we have to add padding
    ctx.translate(radius - 0.5, radius - 0.5);
    width -= 2 * radius;
    height -= 2 * radius;

    ctx.strokeStyle = "silver";
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, width, height);

    var length = data.length;

    var timestamps = data.timestamps;
    var values = data.values;

    var sx = width / (upperTimestamp - lowerTimestamp);
    var ty, sy;
    if (data.maxValue - data.minValue == 0) {
        ty = height / 2;
        sy = 0;
    } else {
        ty = height;
        sy = height / (data.maxValue - data.minValue);
    }

    var lowerIndex = this.findTimestampIndex(lowerTimestamp);
    var upperIndex = this.findTimestampIndex(upperTimestamp);

    if (lowerIndex < 0) {
        lowerIndex = 0;
    }
    if ((upperIndex < (length - 1)) && (timestamps[upperIndex] < upperTimestamp)) {
        upperIndex += 1;
    }

    var minValue = data.minValue;

    // Draw the line
    ctx.beginPath();
    ctx.moveTo(sx * (timestamps[n] - lowerTimestamp), ty - sy * (values[lowerIndex] - minValue));
    for (var n = lowerIndex; n <= upperIndex; n++) {
        ctx.lineTo(
            sx * (timestamps[n] - lowerTimestamp),
            Math.round(ty - sy * (values[n] - minValue)));
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.stroke();

    // ...and the markers
    ctx.fillStyle = color;
/*
    for (var n = 0; n < data.length; n++) {
        ctx.beginPath();
        ctx.arc(
            sx * (timestamps[n] - minTimestamp),
            Math.round(ty - sy * (values[n] - minValue)),
            radius,
            0, 2 * Math.PI,
            true);
        ctx.fill();
    }
*/
/*
    ctx.beginPath();
    for (var n = 0; n < data.length; n++) {
        var x, y;

        x = sx * (timestamps[n] - minTimestamp);
        y = Math.round(ty - sy * (values[n] - minValue));


        ctx.moveTo(x, y);
        ctx.arc(
            x, y,
            radius,
            0, 2 * Math.PI,
            true);
    }
    ctx.fill();
*/
    for (var n = lowerIndex; n <= upperIndex; n++) {
        var x, y;

        x = sx * (timestamps[n] - lowerTimestamp);
        y = Math.round(ty - sy * (values[n] - minValue));

        ctx.fillRect(x - radius, y - radius, 2 * radius, 2 * radius);
    }

    ctx.font = "12px sans-serif";
    ctx.strokeStyle = "white";
    // That's strange. 3 would be correct to give a line of 1px a halo of 1px
    // width, but when stroking text, we should require a width of 2 because
    // the stroke has no width. It looks like crap though, so 3 it is
    ctx.lineWidth = 3;
    ctx.lineJoin = "round";
    ctx.strokeText(data.name, 10, height - 10);
    ctx.fillStyle = "black";
    ctx.fillText(data.name, 10, height - 10);

    ctx.restore();
};

