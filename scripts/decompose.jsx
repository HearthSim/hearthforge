// Photoshop JSX

app.preferences.rulerUnits = Units.PIXELS;

var referenceLayer = "reference",
	titlePathName = "title",
	outputDir = "extract",
	padding = 20,
	doc = app.activeDocument,
	resetLog = true,
	jsonOnly = true,
	jsonFile, outputPath, baseName;
	
var pngOpts = new ExportOptionsSaveForWeb();
pngOpts.PNG8 = false;
pngOpts.transparency = true;
pngOpts.interlaced = false;
pngOpts.quality = 100;
pngOpts.includeProfile = false;
pngOpts.format = SaveDocumentType.PNG;
	
function main() {
	var reGroupName = /(\d+)\s*(\w+)?/,
		reClipName = /clip\s(\w+)/,
		dims, offset, json, group, layer, prefix, hasPrefix, result, layerIndex, 
		i, j, k, regionLayer, regionBounds, clipType, point, pathItems;
	
	baseName = doc.name.substring(0, doc.name.length - 4);
	outputPath = app.activeDocument.path + "/" + outputDir;
	jsonFile = outputPath + "/" + baseName + ".json";
	
	// get the reference layer (a full card image)
	// to calc the crop dimensions to work from
	dims = getReferenceLayer();
	addPadding(dims, padding);
	// top left coord is the offset to adjust for
	offset = [dims[0], dims[1]];
	
	json = {
		"width": dims[2] - dims[0],
		"height": dims[3] - dims[1],
		"text": {}
	};

	// look for title path
	pathItems = app.activeDocument.pathItems;
	for (i = 0; i < pathItems.length; i++) {
		if (pathItems[i].name == titlePathName) {
			for (j = 0; j < pathItems[i].subPathItems.length; j++) {
				numPoints = pathItems[i].subPathItems[j].pathPoints.length
				// want it to be a basic curve, not a full path
				if (numPoints != 2) {
					log("title path not a simple curve");
					break;
				}
				curvePoints = []
				for (k = 0; k < numPoints; k++) {
					point = pathItems[i].subPathItems[j].pathPoints[k];
					// TODO Adjust points for offset
					curvePoints.push({
						"x": Math.round(point.anchor[0]),
						"y": Math.round(point.anchor[1]),
						"cx": Math.round(point.leftDirection[0]),
						"cy": Math.round(point.leftDirection[1])
					});
				}
				json["text"]["name"] = curvePoints;
			}
		}
	}	

	for (i = 0; i < doc.layerSets.length; i++) {
		prefix = "", hasPrefix = false, layerIndex = 0;
		group = doc.layerSets[i];
		if (group.name === "IGNORE" || group.name === "BACKGROUND")
			continue;
		
		// deal with text group separately
		if (group.name == "REGIONS") {
			for (j = 0; j < group.artLayers.length; j++) {
				regionLayer = group.artLayers[j];
				regionBounds = getLayerBounds(regionLayer);
				
				result = reClipName.exec(regionLayer.name);
				if (result !== null && result.length > 1) {
						clipType = result[1];
						json["portraitClip"] = {
							"type": clipType,
							"x": regionBounds[0] - offset[0],
							"y": regionBounds[1] - offset[1],
							"width": regionBounds[2] - regionBounds[0],
							"height": regionBounds[3] - regionBounds[1]
						};
						continue;
				}
				
				json["text"][regionLayer.name] = {
					"x": regionBounds[0] - offset[0],
					"y": regionBounds[1] - offset[1],
					"width": regionBounds[2] - regionBounds[0],
					"height": regionBounds[3] - regionBounds[1]
				};
			}
			continue;
		}
		
		// parse the top level group names
		// TODO switch undefined to array length
		result = reGroupName.exec(group.name);
		if (result[1] !== undefined) {
			layerIndex = parseInt(result[0], 10);
			if (result[2] !== undefined) {
				prefix = result[2];
				hasPrefix = true;
			}
		}
		log("Group: " + group.name + ", " + prefix + ", " + layerIndex);
		
		// handle any regular layers in the group
		for (j = 0; j < group.artLayers.length; j++) {
			if (hasPrefix) {
				addVariant(group.artLayers[j], prefix, json, outputPath, offset, layerIndex);
			} else {
				addImage(group.artLayers[j], prefix, json, outputPath, offset, layerIndex);
			}
		}
		
		// handle any layer groups
		for (j = 0; j < group.layerSets.length; j++) {
			var prefix2 = group.layerSets[j].name;
			for (k = 0; k < group.layerSets[j].artLayers.length; k++) {
				addVariant(group.layerSets[j].artLayers[k], prefix2, json, outputPath, offset, i);
			}
		}
	}
	
	var text = JSON.stringify(json);
	writeTextFile(jsonFile, text);
	alert("Decomposition Complete.");
}

function addVariant(layer, prefix, json, out, offset, index) {
	var imageName;
	log("handle: " + layer + ", " + prefix + ", " + json + ", " + out + ", " + offset + ", " + index)
	if (prefix.length > 0) {
		imageName = prefix + "-" + layer.name + ".png";
	}	else {
		imageName = layer.name + ".png";
	}
	var file = new File(out + "/" + imageName);
	if (!jsonOnly) {
		var tempDoc = app.documents.add(doc.width, doc.height, doc.resolution, "trim", NewDocumentMode.RGB, DocumentFill.TRANSPARENT);
		app.activeDocument = doc;
		var trimLayer = layer.duplicate(tempDoc, ElementPlacement.PLACEATBEGINNING);
		app.activeDocument = tempDoc;
		tempDoc.trim(TrimType.TRANSPARENT);	
		tempDoc.exportDocument(file, ExportType.SAVEFORWEB, pngOpts);
	}
	var bounds = getLayerBounds(layer);
	if (json[prefix] === undefined) {
		// create it
		json[prefix.toString()] = {
			"index": index,
			"x": bounds[0] - offset[0],
			"y": bounds[1] - offset[1],
			"width": bounds[2] - bounds[0],
			"height": bounds[3] - bounds[1],
			"image": null,
			"variants": {}
		};
	}
	json[prefix]["variants"][layer.name.toString()] = imageName; 

	if (!jsonOnly) {
		app.activeDocument = doc;
		tempDoc.close(SaveOptions.DONOTSAVECHANGES);
	}
}

function addImage(layer, prefix, json, out, offset, index) {
		var imageName = prefix + layer.name + ".png";
		var file = new File(out + "/" + imageName);
			
		log("handle: " + layer + ", " + prefix + ", " + json + ", " + out + ", " + offset + ", " + index)
		if (!jsonOnly) {
			var tempDoc = app.documents.add(doc.width, doc.height, doc.resolution, "trim", NewDocumentMode.RGB, DocumentFill.TRANSPARENT);
			app.activeDocument = doc;
			var trimLayer = layer.duplicate(tempDoc, ElementPlacement.PLACEATBEGINNING);
			app.activeDocument = tempDoc;
			tempDoc.trim(TrimType.TRANSPARENT);
			tempDoc.exportDocument(file, ExportType.SAVEFORWEB, pngOpts);
		}
		
		var bounds = getLayerBounds(layer);
		json[layer.name.toString()] = {
			"index": index,
			"x": bounds[0] - offset[0],
			"y": bounds[1] - offset[1],
			"width": bounds[2] - bounds[0],
			"height": bounds[3] - bounds[1],
			"image": imageName,
			"variants": null
		};
		
		if (!jsonOnly) {
			app.activeDocument = doc;
			tempDoc.close(SaveOptions.DONOTSAVECHANGES);
		}
}

function addPadding(arr, pad) {
	// TODO need to check there is enough space
	arr[0] -= pad;
	arr[1] -= pad;
	arr[2] += pad;
	arr[3] += pad;
}

function getLayerBounds(layer) {
	return [
		parseFloat(layer.bounds[0]),
		parseFloat(layer.bounds[1]),
		parseFloat(layer.bounds[2]),
		parseFloat(layer.bounds[3])
	];
}

function getReferenceLayer() {
	var bounds = [];
	for (var i = 0; i < doc.artLayers.length; i++) {
		if (doc.artLayers[i].name == referenceLayer) {
			bounds = getLayerBounds(doc.artLayers[i]);
		}
	}
	return bounds;
}
	
function writeTextFile(afilename, output) {
  var txtFile = new File(afilename);
  txtFile.open("w");
  txtFile.writeln(output);
  txtFile.close();
}

function log(message) {
  var txtFile = new File("decompose.log");
	if (resetLog) {
		txtFile.open("w");
		resetLog = false;
	} else {
		txtFile.open("a");
	}  
  txtFile.writeln(message);
  txtFile.close();
}

// Include https://github.com/douglascrockford/JSON-js to enable JSON.stringify
// -----------------------------------------------------------------------------
//  json2.js
//  2016-10-28
//  Public Domain.
//  NO WARRANTY EXPRESSED OR IMPLIED. USE AT YOUR OWN RISK.
//  See http://www.JSON.org/js.html
//  This code should be minified before deployment.
//  See http://javascript.crockford.com/jsmin.html

//  USE YOUR OWN COPY. IT IS EXTREMELY UNWISE TO LOAD CODE FROM SERVERS YOU DO
//  NOT CONTROL.

//  This file creates a global JSON object containing two methods: stringify
//  and parse. This file provides the ES5 JSON capability to ES3 systems.
//  If a project might run on IE8 or earlier, then this file should be included.
//  This file does nothing on ES5 systems.

//      JSON.stringify(value, replacer, space)
//          value       any JavaScript value, usually an object or array.
//          replacer    an optional parameter that determines how object
//                      values are stringified for objects. It can be a
//                      function or an array of strings.
//          space       an optional parameter that specifies the indentation
//                      of nested structures. If it is omitted, the text will
//                      be packed without extra whitespace. If it is a number,
//                      it will specify the number of spaces to indent at each
//                      level. If it is a string (such as "\t" or "&nbsp;"),
//                      it contains the characters used to indent at each level.
//          This method produces a JSON text from a JavaScript value.
//          When an object value is found, if the object contains a toJSON
//          method, its toJSON method will be called and the result will be
//          stringified. A toJSON method does not serialize: it returns the
//          value represented by the name/value pair that should be serialized,
//          or undefined if nothing should be serialized. The toJSON method
//          will be passed the key associated with the value, and this will be
//          bound to the value.

//          For example, this would serialize Dates as ISO strings.

//              Date.prototype.toJSON = function (key) {
//                  function f(n) {
//                      // Format integers to have at least two digits.
//                      return (n < 10)
//                          ? "0" + n
//                          : n;
//                  }
//                  return this.getUTCFullYear()   + "-" +
//                       f(this.getUTCMonth() + 1) + "-" +
//                       f(this.getUTCDate())      + "T" +
//                       f(this.getUTCHours())     + ":" +
//                       f(this.getUTCMinutes())   + ":" +
//                       f(this.getUTCSeconds())   + "Z";
//              };

//          You can provide an optional replacer method. It will be passed the
//          key and value of each member, with this bound to the containing
//          object. The value that is returned from your method will be
//          serialized. If your method returns undefined, then the member will
//          be excluded from the serialization.

//          If the replacer parameter is an array of strings, then it will be
//          used to select the members to be serialized. It filters the results
//          such that only members with keys listed in the replacer array are
//          stringified.

//          Values that do not have JSON representations, such as undefined or
//          functions, will not be serialized. Such values in objects will be
//          dropped; in arrays they will be replaced with null. You can use
//          a replacer function to replace those with JSON values.

//          JSON.stringify(undefined) returns undefined.

//          The optional space parameter produces a stringification of the
//          value that is filled with line breaks and indentation to make it
//          easier to read.

//          If the space parameter is a non-empty string, then that string will
//          be used for indentation. If the space parameter is a number, then
//          the indentation will be that many spaces.

//          Example:

//          text = JSON.stringify(["e", {pluribus: "unum"}]);
//          // text is '["e",{"pluribus":"unum"}]'

//          text = JSON.stringify(["e", {pluribus: "unum"}], null, "\t");
//          // text is '[\n\t"e",\n\t{\n\t\t"pluribus": "unum"\n\t}\n]'

//          text = JSON.stringify([new Date()], function (key, value) {
//              return this[key] instanceof Date
//                  ? "Date(" + this[key] + ")"
//                  : value;
//          });
//          // text is '["Date(---current time---)"]'

//      JSON.parse(text, reviver)
//          This method parses a JSON text to produce an object or array.
//          It can throw a SyntaxError exception.

//          The optional reviver parameter is a function that can filter and
//          transform the results. It receives each of the keys and values,
//          and its return value is used instead of the original value.
//          If it returns what it received, then the structure is not modified.
//          If it returns undefined then the member is deleted.

//          Example:

//          // Parse the text. Values that look like ISO date strings will
//          // be converted to Date objects.

//          myData = JSON.parse(text, function (key, value) {
//              var a;
//              if (typeof value === "string") {
//                  a =
//   /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2}(?:\.\d*)?)Z$/.exec(value);
//                  if (a) {
//                      return new Date(Date.UTC(+a[1], +a[2] - 1, +a[3], +a[4],
//                          +a[5], +a[6]));
//                  }
//              }
//              return value;
//          });

//          myData = JSON.parse('["Date(09/09/2001)"]', function (key, value) {
//              var d;
//              if (typeof value === "string" &&
//                      value.slice(0, 5) === "Date(" &&
//                      value.slice(-1) === ")") {
//                  d = new Date(value.slice(5, -1));
//                  if (d) {
//                      return d;
//                  }
//              }
//              return value;
//          });

//  This is a reference implementation. You are free to copy, modify, or
//  redistribute.

/*jslint
    eval, for, this
*/

/*property
    JSON, apply, call, charCodeAt, getUTCDate, getUTCFullYear, getUTCHours,
    getUTCMinutes, getUTCMonth, getUTCSeconds, hasOwnProperty, join,
    lastIndex, length, parse, prototype, push, replace, slice, stringify,
    test, toJSON, toString, valueOf
*/


// Create a JSON object only if one does not already exist. We create the
// methods in a closure to avoid creating global variables.

if (typeof JSON !== "object") {
    JSON = {};
}

(function () {
    "use strict";

    var rx_one = /^[\],:{}\s]*$/;
    var rx_two = /\\(?:["\\\/bfnrt]|u[0-9a-fA-F]{4})/g;
    var rx_three = /"[^"\\\n\r]*"|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/g;
    var rx_four = /(?:^|:|,)(?:\s*\[)+/g;
    var rx_escapable = /[\\"\u0000-\u001f\u007f-\u009f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g;
    var rx_dangerous = /[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g;

    function f(n) {
        // Format integers to have at least two digits.
        return n < 10
            ? "0" + n
            : n;
    }

    function this_value() {
        return this.valueOf();
    }

    if (typeof Date.prototype.toJSON !== "function") {

        Date.prototype.toJSON = function () {

            return isFinite(this.valueOf())
                ? this.getUTCFullYear() + "-" +
                        f(this.getUTCMonth() + 1) + "-" +
                        f(this.getUTCDate()) + "T" +
                        f(this.getUTCHours()) + ":" +
                        f(this.getUTCMinutes()) + ":" +
                        f(this.getUTCSeconds()) + "Z"
                : null;
        };

        Boolean.prototype.toJSON = this_value;
        Number.prototype.toJSON = this_value;
        String.prototype.toJSON = this_value;
    }

    var gap;
    var indent;
    var meta;
    var rep;


    function quote(string) {

// If the string contains no control characters, no quote characters, and no
// backslash characters, then we can safely slap some quotes around it.
// Otherwise we must also replace the offending characters with safe escape
// sequences.

        rx_escapable.lastIndex = 0;
        return rx_escapable.test(string)
            ? "\"" + string.replace(rx_escapable, function (a) {
                var c = meta[a];
                return typeof c === "string"
                    ? c
                    : "\\u" + ("0000" + a.charCodeAt(0).toString(16)).slice(-4);
            }) + "\""
            : "\"" + string + "\"";
    }


    function str(key, holder) {

// Produce a string from holder[key].

        var i;          // The loop counter.
        var k;          // The member key.
        var v;          // The member value.
        var length;
        var mind = gap;
        var partial;
        var value = holder[key];

// If the value has a toJSON method, call it to obtain a replacement value.

        if (value && typeof value === "object" &&
                typeof value.toJSON === "function") {
            value = value.toJSON(key);
        }

// If we were called with a replacer function, then call the replacer to
// obtain a replacement value.

        if (typeof rep === "function") {
            value = rep.call(holder, key, value);
        }

// What happens next depends on the value's type.

        switch (typeof value) {
        case "string":
            return quote(value);

        case "number":

// JSON numbers must be finite. Encode non-finite numbers as null.

            return isFinite(value)
                ? String(value)
                : "null";

        case "boolean":
        case "null":

// If the value is a boolean or null, convert it to a string. Note:
// typeof null does not produce "null". The case is included here in
// the remote chance that this gets fixed someday.

            return String(value);

// If the type is "object", we might be dealing with an object or an array or
// null.

        case "object":

// Due to a specification blunder in ECMAScript, typeof null is "object",
// so watch out for that case.

            if (!value) {
                return "null";
            }

// Make an array to hold the partial results of stringifying this object value.

            gap += indent;
            partial = [];

// Is the value an array?

            if (Object.prototype.toString.apply(value) === "[object Array]") {

// The value is an array. Stringify every element. Use null as a placeholder
// for non-JSON values.

                length = value.length;
                for (i = 0; i < length; i += 1) {
                    partial[i] = str(i, value) || "null";
                }

// Join all of the elements together, separated with commas, and wrap them in
// brackets.

                v = partial.length === 0
                    ? "[]"
                    : gap
                        ? "[\n" + gap + partial.join(",\n" + gap) + "\n" + mind + "]"
                        : "[" + partial.join(",") + "]";
                gap = mind;
                return v;
            }

// If the replacer is an array, use it to select the members to be stringified.

            if (rep && typeof rep === "object") {
                length = rep.length;
                for (i = 0; i < length; i += 1) {
                    if (typeof rep[i] === "string") {
                        k = rep[i];
                        v = str(k, value);
                        if (v) {
                            partial.push(quote(k) + (
                                gap
                                    ? ": "
                                    : ":"
                            ) + v);
                        }
                    }
                }
            } else {

// Otherwise, iterate through all of the keys in the object.

                for (k in value) {
                    if (Object.prototype.hasOwnProperty.call(value, k)) {
                        v = str(k, value);
                        if (v) {
                            partial.push(quote(k) + (
                                gap
                                    ? ": "
                                    : ":"
                            ) + v);
                        }
                    }
                }
            }

// Join all of the member texts together, separated with commas,
// and wrap them in braces.

            v = partial.length === 0
                ? "{}"
                : gap
                    ? "{\n" + gap + partial.join(",\n" + gap) + "\n" + mind + "}"
                    : "{" + partial.join(",") + "}";
            gap = mind;
            return v;
        }
    }

// If the JSON object does not yet have a stringify method, give it one.

    if (typeof JSON.stringify !== "function") {
        meta = {    // table of character substitutions
            "\b": "\\b",
            "\t": "\\t",
            "\n": "\\n",
            "\f": "\\f",
            "\r": "\\r",
            "\"": "\\\"",
            "\\": "\\\\"
        };
        JSON.stringify = function (value, replacer, space) {

// The stringify method takes a value and an optional replacer, and an optional
// space parameter, and returns a JSON text. The replacer can be a function
// that can replace values, or an array of strings that will select the keys.
// A default replacer method can be provided. Use of the space parameter can
// produce text that is more easily readable.

            var i;
            gap = "";
            indent = "";

// If the space parameter is a number, make an indent string containing that
// many spaces.

            if (typeof space === "number") {
                for (i = 0; i < space; i += 1) {
                    indent += " ";
                }

// If the space parameter is a string, it will be used as the indent string.

            } else if (typeof space === "string") {
                indent = space;
            }

// If there is a replacer, it must be a function or an array.
// Otherwise, throw an error.

            rep = replacer;
            if (replacer && typeof replacer !== "function" &&
                    (typeof replacer !== "object" ||
                    typeof replacer.length !== "number")) {
                throw new Error("JSON.stringify");
            }

// Make a fake root object containing our value under the key of "".
// Return the result of stringifying the value.

            return str("", {"": value});
        };
    }


// If the JSON object does not yet have a parse method, give it one.

    if (typeof JSON.parse !== "function") {
        JSON.parse = function (text, reviver) {

// The parse method takes a text and an optional reviver function, and returns
// a JavaScript value if the text is a valid JSON text.

            var j;

            function walk(holder, key) {

// The walk method is used to recursively walk the resulting structure so
// that modifications can be made.

                var k;
                var v;
                var value = holder[key];
                if (value && typeof value === "object") {
                    for (k in value) {
                        if (Object.prototype.hasOwnProperty.call(value, k)) {
                            v = walk(value, k);
                            if (v !== undefined) {
                                value[k] = v;
                            } else {
                                delete value[k];
                            }
                        }
                    }
                }
                return reviver.call(holder, key, value);
            }


// Parsing happens in four stages. In the first stage, we replace certain
// Unicode characters with escape sequences. JavaScript handles many characters
// incorrectly, either silently deleting them, or treating them as line endings.

            text = String(text);
            rx_dangerous.lastIndex = 0;
            if (rx_dangerous.test(text)) {
                text = text.replace(rx_dangerous, function (a) {
                    return "\\u" +
                            ("0000" + a.charCodeAt(0).toString(16)).slice(-4);
                });
            }

// In the second stage, we run the text against regular expressions that look
// for non-JSON patterns. We are especially concerned with "()" and "new"
// because they can cause invocation, and "=" because it can cause mutation.
// But just to be safe, we want to reject all unexpected forms.

// We split the second stage into 4 regexp operations in order to work around
// crippling inefficiencies in IE's and Safari's regexp engines. First we
// replace the JSON backslash pairs with "@" (a non-JSON character). Second, we
// replace all simple value tokens with "]" characters. Third, we delete all
// open brackets that follow a colon or comma or that begin the text. Finally,
// we look to see that the remaining characters are only whitespace or "]" or
// "," or ":" or "{" or "}". If that is so, then the text is safe for eval.

            if (
                rx_one.test(
                    text
                        .replace(rx_two, "@")
                        .replace(rx_three, "]")
                        .replace(rx_four, "")
                )
            ) {

// In the third stage we use the eval function to compile the text into a
// JavaScript structure. The "{" operator is subject to a syntactic ambiguity
// in JavaScript: it can begin a block or an object literal. We wrap the text
// in parens to eliminate the ambiguity.

                j = eval("(" + text + ")");

// In the optional fourth stage, we recursively walk the new structure, passing
// each name/value pair to a reviver function for possible transformation.

                return (typeof reviver === "function")
                    ? walk({"": j}, "")
                    : j;
            }

// If the text is not JSON parseable, then a SyntaxError is thrown.

            throw new SyntaxError("JSON.parse");
        };
    }
}());
//------------------------------------------------------------------------------

// Run the decompose script
main();
