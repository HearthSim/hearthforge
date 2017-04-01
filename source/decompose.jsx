// -----------------------------------------------------------------------------
//	HearthForge - Photoshop JSX Script
//
//	Decomposes Hearthstone card layouts from photoshop into component images
//	and their	coordinates as json.
// -----------------------------------------------------------------------------
#script "HearthForge Decompose"
#target "photoshop"
//	Include json2.js (https://github.com/douglascrockford/JSON-js)
#include "json2.js"

(function() {
	app.preferences.rulerUnits = Units.PIXELS;
	var doc = app.activeDocument;
	var pngOpts = pngOptions();
	var fileExt = ".png";
	var logger = createLog("decompose.log");
	var config = loadConfig("decompose.cfg");
	var jsonFile, outputPath, baseName;

	function main() {
		var reGroupName = /(\d+)\s+(\w+)\s*(\w+)?/;
		var reTextLayer = /^text/;
		var reDefaultLayer = /^default/;
		var reClipLayer = /^clip\s+(\w+)/;
		var rePathLayer = /^path\s+(\w+)/;
		var offset, json, group, layer, prefix, result, layerIndex,cardGroup,
			i, j, k, l, q, regionBounds, point, pathItems, layerName, basePath, crop;

		// init json and file names
		baseName = doc.name.substring(0, doc.name.length - 4);
		basePath = app.activeDocument.path + "/" + baseName;
		mkdir(basePath);
		jsonFile = basePath + "/data.json";
		// use the cardCrop in the config (different for each theme)
		// to set the required card dimensions, based on the original assets.
		// (x, y) is the top left coord and is the offset to adjust for.
		crop = config.cardCrop[baseName];
		// add new json object, with (w, h) to use
		json = { "name": baseName, "width": crop.width, "height": crop.height };
		offset = [crop.x, crop.y];
		// walk the layer group hierarchy
		// top level groups - card types (separate premium and all variants)
		excludeJump:
		for (l = 0; l < doc.layerSets.length; l++) {
			// set the name and output dir for this card type
			cardGroup = doc.layerSets[l];
			// check the configs excluded list for the current card type
			for (q = 0; q < config.exclude.length; q++) {
				if (config.exclude[q] == cardGroup.name) {
					continue excludeJump; // jump out of this inner loop
				}
			}
			json[cardGroup.name] = {};
			// create output dir
			outputPath = basePath + "/" +  cardGroup.name
			mkdir(outputPath);
			// handle components, defined as groups
			for (i = 0; i < cardGroup.layerSets.length; i++) {
				prefix = "", layerIndex = 0;
				group = cardGroup.layerSets[i];
				// ignore certain groups
				if (group.name === "IGNORE" || group.name === "BACKGROUND")
					continue;
				// parse the group names
				result = reGroupName.exec(group.name);
				if (result !== null && result.length >= 1) {
					layerIndex = parseInt(result[0], 10);
					if (result.length >= 2) {
						prefix = result[2];
						// check for a custom group, handle differently to normal
						if (result.length >= 3 && result[3] !== undefined) {
							handleCustom(baseName, group.artLayers, result[3], json, outputPath, offset, cardGroup.name, layerIndex, prefix);
							continue;
						}
					}
				}
				logger.log("Group " + group.name + " (" + prefix + ", " + layerIndex + ")");
				// ignore empty layers
				if (group.artLayers.length > 0) {
					json[cardGroup.name][prefix] = {};
					json[cardGroup.name][prefix]["layer"] = layerIndex;
					// add the font obj if it exists
					addFont(baseName, cardGroup.name, prefix, json[cardGroup.name][prefix]);
				}
				// handle any regular layers in the group
				for (j = 0; j < group.artLayers.length; j++) {
					layerName = group.artLayers[j].name;
					// check if its a text layer
					result = reTextLayer.exec(layerName);
					if (result !== null) {
						logger.log("Handling Text layer");
						regionBounds = getLayerBounds(group.artLayers[j]);
						json[cardGroup.name][prefix]["text"] = {
							"x": regionBounds[0] - offset[0],
							"y": regionBounds[1] - offset[1],
							"width": regionBounds[2] - regionBounds[0],
							"height": regionBounds[3] - regionBounds[1]
						};
						continue;
					}
					// check if its an default image layer
					result = reDefaultLayer.exec(layerName);
					if (result !== null) {
						logger.log("Handling default image layer");
						addImage(group.artLayers[j], prefix, json[cardGroup.name][prefix], outputPath, offset, cardGroup.name);
						continue;
					}
					// check if its a clip layer
					result = reClipLayer.exec(layerName);
					if (result !== null && result.length >= 2) {
						logger.log("Handling Clip layer");
						if (result[1] == "polygon") {
							json[cardGroup.name][prefix]["clip"] = {
								"type": result[1],
								"points": pathPoints(cardGroup.name + "_" + prefix + "_clip", offset)
							};
						} else {
							// an old style clip shape
							logger.log("WARNING: Unknown clip type, " + result[1]);
						}
						continue;
					}
					// check if its a path layer
					result = rePathLayer.exec(layerName);
					if (result !== null && result.length >= 2) {
						logger.log("Handling path (curve) layer " + result[1]);
						addSimpleCurve(result[1], json[cardGroup.name][prefix], offset);
						continue;
					}
					// otherwise it must be a multi image component
					logger.log("Handling mulit image group layer " + layerName);
					addImage(group.artLayers[j], prefix, json[cardGroup.name][prefix],
						outputPath, offset, cardGroup.name, true);
				}
			}
		}
		// save the json to file
		logger.log("Creating json");
		var text = JSON.stringify(json);
		writeTextToFile(jsonFile, text);
		alert("Decomposition Complete.");
		logger.close();
	}

	// handle a custom component and write data to json obj
	function handleCustom(base, group, name, parentJson, out, offset, type, index, prefix) {
		logger.log("Adding custom, " + base + " " + name);
		var file = File(base + ".json");
		if (!file.exists) {
			logger.log("WARNING: File not found " + base + ".json");
			return;
		}
		file.open("r");
		var data = file.read();
		file.close();
		var json = JSON.parse(data);
		// generate custom data, images & regions
		var layers = json["custom"][name]["layers"];
		for (var i = 0; i < group.length; i++) {
			if (layers[group[i].name] == "image") {
				addImage(group[i], "custom_" + group[i].name, json["custom"][name], out, offset, type);
			} else if (layers[group[i].name] == "region") {
				var regionBounds = getLayerBounds(group[i]);
				json["custom"][name]["region"] = {
					"x": regionBounds[0] - offset[0],
					"y": regionBounds[1] - offset[1],
					"width": regionBounds[2] - regionBounds[0],
					"height": regionBounds[3] - regionBounds[1]
				};
			}
		}
		// overwrite load data with generated data
		json["custom"][name]["name"] = name;
		json["custom"][name]["layers"] = undefined;
		parentJson[type][prefix] = {};
		parentJson[type][prefix]["layer"] = index;
		parentJson[type][prefix]["custom"] = json["custom"][name];
	}

	// adds font data (from external json) for text components to the json output
	function addFont(base, cardType, component, json) {
		logger.log("Adding font, " + cardType + " " + component);
		// open the themes json data file
		var file = File(base + ".json");
		if (!file.exists) {
			logger.log("File not found: " + base + ".json");
			return;
		}
		file.open("r");
		var data = file.read();
		file.close();
		// use the loaded font data to define this component
		var fontData = JSON.parse(data)["text"];
		if (fontData["default"][component] !== undefined) {
			// initialize with the default data
			var font = fontData["default"][component];
			// overwrite with component specific data if found
			if (fontData[cardType] !== undefined && fontData[cardType][component] !== undefined) {
				var obj = fontData[cardType][component];
				for (var key in obj) {
					if (obj.hasOwnProperty(key)) {
						font[key] = obj[key];
					}
				}
			}
			json["font"] = font;
		}
	}

	// returns an array of the anchor points of a named path
	// i.e. ignores curves, left/right control points
	function pathPoints(pathName, offset) {
		var pathItems, i, point, numPoints, points = [];
		logger.log("Getting path points for " + pathName + ", with offset " + offset);
		pathItems = app.activeDocument.pathItems;
		for (i = 0; i < pathItems.length; i++) {
			// only want the path with the given name
			if (pathItems[i].name == pathName) {
				for (j = 0; j < pathItems[i].subPathItems.length; j++) {
					for (k = 0; k < pathItems[i].subPathItems[j].pathPoints.length; k++) {
						point = pathItems[i].subPathItems[j].pathPoints[k];
						points.push({
							"x": Math.round(point.anchor[0] - offset[0]),
							"y": Math.round(point.anchor[1] - offset[1])
						});
					}
				}
			}
		}
		if (points.length <= 0) {
			logger.log("WARNING: path not found, " + pathName);
		}
		return points;
	}

	// adds a named path as simple bezier curve, to be used for text to follow
	function addSimpleCurve(pathName, json, offset) {
		var pathItems, i, point, numPoints;
		logger.log("Adding curve " + pathName);
		// look for title path
		pathItems = app.activeDocument.pathItems;
		for (i = 0; i < pathItems.length; i++) {
			if (pathItems[i].name == pathName) {
				for (j = 0; j < pathItems[i].subPathItems.length; j++) {
					numPoints = pathItems[i].subPathItems[j].pathPoints.length
					// want it to be a basic curve, not a full path
					if (numPoints != 2) {
						logger.log("title path not a simple curve");
						break;
					}
					json["textCurve"] = {};
					point = pathItems[i].subPathItems[j].pathPoints[0];
					json["textCurve"]["start"] = {
						"x": Math.round(point.anchor[0] - offset[0]),
						"y": Math.round(point.anchor[1] - offset[1])
					}
					json["textCurve"]["c1"] = {
						"x": Math.round(point.leftDirection[0] - offset[0]),
						"y": Math.round(point.leftDirection[1] - offset[1])
					}
					point = pathItems[i].subPathItems[j].pathPoints[1];
					json["textCurve"]["end"] = {
						"x": Math.round(point.anchor[0] - offset[0]),
						"y": Math.round(point.anchor[1] - offset[1])
					}
					json["textCurve"]["c2"] = {
						"x": Math.round(point.rightDirection[0] - offset[0]),
						"y": Math.round(point.rightDirection[1] - offset[1])
					}
				}
			}
		}
	}

	// process an image layer and store its attributes in json obj
	function addImage(layer, prefix, json, out, offset, typeName, multi) {
		var imageName;
		if (multi !== undefined) {
			imageName = prefix + "_" + layer.name + fileExt;
		} else {
			imageName = prefix + fileExt;
		}
		logger.log("Adding image " + imageName + ", (Multi:" + multi + ")");
		var file = new File(out + "/" + imageName);
		// handle the image layer, if enabled
		if (!config.jsonOnly) {
			var tempDoc = app.documents.add(doc.width, doc.height, doc.resolution,
				"trim", NewDocumentMode.RGB, DocumentFill.TRANSPARENT);
			app.activeDocument = doc;
			var trimLayer = layer.duplicate(tempDoc, ElementPlacement.PLACEATBEGINNING);
			app.activeDocument = tempDoc;
			tempDoc.trim(TrimType.TRANSPARENT);
			tempDoc.exportDocument(file, ExportType.SAVEFORWEB, pngOpts);
		}
		// initialize the obj if doesn't exist
		if (json["image"] === undefined) {
			json["image"] = {};
			// for multi images expect them all to be the same size
			var bounds = getLayerBounds(layer);
			json["image"]["x"] = bounds[0] - offset[0];
			json["image"]["y"] = bounds[1] - offset[1];
			json["image"]["width"] = bounds[2] - bounds[0];
			json["image"]["height"] = bounds[3] - bounds[1];
			if (multi) {
					json["image"]["assets"] = {};
			} else {
				json["image"]["assets"] = { "default": typeName + "/" + imageName };
			}
		}
		// add each image of multi set on each call, store as name, filename
		if (multi) {
			json["image"]["assets"][layer.name] = typeName + "/" + imageName;
		}
		// save the image if enabled
		if (!config.jsonOnly) {
			app.activeDocument = doc;
			tempDoc.close(SaveOptions.DONOTSAVECHANGES);
		}
	}

	// create a PNG options object for saving images
	function pngOptions() {
		var opts = new ExportOptionsSaveForWeb();
		opts.PNG8 = false;
		opts.transparency = true;
		opts.interlaced = false;
		opts.quality = 100;
		opts.includeProfile = false;
		opts.format = SaveDocumentType.PNG;
		return opts;
	}

	// get the actual bounds of the contents of the layer (transparency ignored)
	function getLayerBounds(layer) {
		return [
			parseFloat(layer.bounds[0]),
			parseFloat(layer.bounds[1]),
			parseFloat(layer.bounds[2]),
			parseFloat(layer.bounds[3])
		];
	}

	// write text to a file
	function writeTextToFile(filename, text) {
		logger.log("Writing to " + filename);
		var f = File(filename);
		f.lineFeed = "Unix";
		f.encoding = "UTF-8";
		f.open("w");
		f.writeln(text);
		f.close();
	}

	// make a directory if it doesn't exist
	function mkdir(dir) {
		if (config.jsonOnly) {
			logger.log("Skipping mkdir (" + dir + ")");
			return;
		}
		var folder = Folder(dir);
		if (!folder.exists) {
			logger.log("Creating folder: " + dir)
			folder.create();
		}
	}

	// create a logger
	function createLog(filename) {
	  var file = new File(filename);
		file.open("w");
		return {
			log: function(message) {
				file.writeln(message);
			},
			close: function() {
				file.close();
			}
		};
	}

	// load a config file
	function loadConfig(filename) {
		logger.log("Loading config: " + filename);
		var file = new File(filename);
		file.open("r");
		var data = file.read();
		file.close();
		return JSON.parse(data);
	}

	main();
}());
