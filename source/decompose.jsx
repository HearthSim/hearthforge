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
	var pngOpts = new ExportOptionsSaveForWeb();

	pngOpts.PNG8 = false;
	pngOpts.transparency = true;
	pngOpts.interlaced = false;
	pngOpts.quality = 100;
	pngOpts.includeProfile = false;
	pngOpts.format = SaveDocumentType.PNG;

	var	referenceLayer = "reference";
	var fileExt = ".png";

	var config = loadConfig("decompose.cfg");
	var logger = createLog("decompose.log");
	var jsonFile, outputPath, baseName;

	function main() {
		var reGroupName = /(\d+)\s+(\w+)\s*(\w+)?/;
		var reClipName = /clip\s(\w+)/;
		var reTextLayer = /^text/;
		var reDefaultLayer = /^default/;
		var reClipLayer = /^clip\s+(\w+)/;
		var rePathLayer = /^path\s+(\w+)/;

		var dims, offset, json, group, layer, prefix, result, layerIndex,
			cardGroup, i, j, k, l, regionLayer, regionBounds, clipType, point,
			pathItems, layerName, basePath, outFolder;

		baseName = doc.name.substring(0, doc.name.length - 4);
		basePath = app.activeDocument.path + "/" + baseName;
		mkdir(basePath);
		jsonFile = basePath + "/" + baseName + ".json";
		json = { "style": baseName };

		// top level groups - card types (separate premium and all variants)
		for (l = 0; l < doc.layerSets.length; l++) {
			// set the name an output dir for this card type
			cardGroup = doc.layerSets[l];
			// check config if this group is to be processed
			if (!contains(config.cardTypes, cardGroup.name)) {
				continue;
			}
			// create output dir
			outputPath = basePath + "/" +  cardGroup.name
			mkdir(outputPath);
			// get the reference layer (a full card image)
			// to calc the crop dimensions to work from
			dims = getReferenceLayer(cardGroup.artLayers);
			addPadding(dims, config.padding);
			// top left coord is the offset to adjust for
			offset = [dims[0], dims[1]];
			// add new json object
			json[cardGroup.name] = {
				"width": dims[2] - dims[0],
				"height": dims[3] - dims[1]
			};
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
				logger.log("Group: " + group.name + " (" + prefix + ", " + layerIndex + ")");
				// ignore empty layers
				if (group.artLayers.length > 0) {
					json[cardGroup.name][prefix] = {};
					json[cardGroup.name][prefix]["layer"] = layerIndex;
				}
				// handle any regular layers in the group
				for (j = 0; j < group.artLayers.length; j++) {
					layerName = group.artLayers[j].name;
					// check if its a text layer
					result = reTextLayer.exec(layerName);
					if (result !== null) {
						logger.log("Layer: TEXT");
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
						logger.log("Layer: IMAGE");
						addImage(group.artLayers[j], prefix, json[cardGroup.name][prefix], outputPath, offset, cardGroup.name);
						continue;
					}
					// check if its a clip layer
					result = reClipLayer.exec(layerName);
					if (result !== null && result.length >= 2) {
						logger.log("Layer: CLIP " + result[1]);
						regionBounds = getLayerBounds(group.artLayers[j]);
						json[cardGroup.name][prefix]["clipRegion"] = {
							"type": result[1],
							"x": regionBounds[0] - offset[0],
							"y": regionBounds[1] - offset[1],
							"width": regionBounds[2] - regionBounds[0],
							"height": regionBounds[3] - regionBounds[1]
						};
						continue;
					}
					// check if its a path layer
					result = rePathLayer.exec(layerName);
					if (result !== null && result.length >= 2) {
						logger.log("Layer: PATH " + result[1]);
						addPath(result[1], json[cardGroup.name][prefix], offset);
						continue;
					}
					// otherwise it must be a multi image component
					logger.log("Layer: IMAGE " + layerName);
					addMulti(group.artLayers[j], prefix, json[cardGroup.name][prefix], outputPath, offset, cardGroup.name);
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

	function handleCustom(base, group, name, parentJson, out, offset, type, index, prefix) {
		logger.log("Custom: " + base + ", " + name);

		var file = File(base + ".json");
		if (!file.exists) {
			logger.log("File not found: " + base + ".json");
		}

		file.open("r");
		var data = file.read();
		file.close();
		var json = JSON.parse(data);

		var layers = json[name]["layers"];
		for (var i = 0; i < group.length; i++) {
			if (layers[group[i].name] == "image") {
				logger.log("custom: adding image");
				addImage(group[i], "custom_" + group[i].name, json[name], out, offset, type);
			} else if (layers[group[i].name] == "region") {
				logger.log("custom: adding region");
				var regionBounds = getLayerBounds(group[i]);
				json[name]["region"] = {
					"x": regionBounds[0] - offset[0],
					"y": regionBounds[1] - offset[1],
					"width": regionBounds[2] - regionBounds[0],
					"height": regionBounds[3] - regionBounds[1]
				};
			}
		}

		json[name]["name"] = name;
		json[name]["layers"] = undefined;
		parentJson[type][prefix] = {};
		parentJson[type][prefix]["layer"] = index;
		parentJson[type][prefix]["custom"] = json[name];
	}

	function addPath(pathName, json, offset) {
		var pathItems, i, point, numPoints;
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

	function addImage(layer, prefix, json, out, offset, typeName) {
			var imageName = prefix + fileExt;
			var file = new File(out + "/" + imageName);

			logger.log("handle: " + layer + ", " + prefix + ", " + out + ", " + offset)
			if (!config.jsonOnly) {
				var tempDoc = app.documents.add(doc.width, doc.height, doc.resolution,
					"trim", NewDocumentMode.RGB, DocumentFill.TRANSPARENT);
				app.activeDocument = doc;
				var trimLayer = layer.duplicate(tempDoc, ElementPlacement.PLACEATBEGINNING);
				app.activeDocument = tempDoc;
				tempDoc.trim(TrimType.TRANSPARENT);
				tempDoc.exportDocument(file, ExportType.SAVEFORWEB, pngOpts);
			}

			json["image"] = {};
			var bounds = getLayerBounds(layer);
			json["image"]["x"] = bounds[0] - offset[0];
			json["image"]["y"] = bounds[1] - offset[1];
			json["image"]["width"] = bounds[2] - bounds[0];
			json["image"]["height"] = bounds[3] - bounds[1];
			json["image"]["assets"] = { "default": typeName + "/" + imageName };

			if (!config.jsonOnly) {
				app.activeDocument = doc;
				tempDoc.close(SaveOptions.DONOTSAVECHANGES);
			}
	}

	function addMulti(layer, prefix, json, out, offset, typeName) {
			var imageName = prefix + "_" + layer.name + fileExt;
			var file = new File(out + "/" + imageName);

			logger.log("handle: " + layer + ", " + prefix + ", " + out + ", " + offset)
			if (!config.jsonOnly) {
				var tempDoc = app.documents.add(doc.width, doc.height, doc.resolution,
					"trim", NewDocumentMode.RGB, DocumentFill.TRANSPARENT);
				app.activeDocument = doc;
				var trimLayer = layer.duplicate(tempDoc, ElementPlacement.PLACEATBEGINNING);
				app.activeDocument = tempDoc;
				tempDoc.trim(TrimType.TRANSPARENT);
				tempDoc.exportDocument(file, ExportType.SAVEFORWEB, pngOpts);
			}

			// all images should be the same size, so record the first one's dimensions
			if (json["image"] === undefined) {
				json["image"] = {};
				var bounds = getLayerBounds(layer);
				json["image"]["x"] = bounds[0] - offset[0];
				json["image"]["y"] = bounds[1] - offset[1];
				json["image"]["width"] = bounds[2] - bounds[0];
				json["image"]["height"] = bounds[3] - bounds[1];
				json["image"]["assets"] = {};
			}
			// record the names and filenames of the images in dict
			json["image"]["assets"][layer.name] = typeName + "/" + imageName;

			if (!config.jsonOnly) {
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

	function getReferenceLayer(layers) {
		var i, bounds = [];
		for (i = 0; i < layers.length; i++) {
			if (layers[i].name == referenceLayer) {
				bounds = getLayerBounds(layers[i]);
			}
		}
		return bounds;
	}

	// write text to a file
	function writeTextToFile(filename, text) {
		var f = File(filename);
		f.open("w");
		f.writeln(text);
		f.close();
	}

	// make a directory if it doesn't exist
	function mkdir(dir) {
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

	function loadConfig(filename) {
		var file = new File(filename);
		file.open("r");
		var data = file.read();
		file.close();
		return JSON.parse(data);
	}

	function contains(array, element) {
		for (var i = 0; i < array.length; i++) {
			if (array[i] == element) {
				return true;
			}
		}
		return false;
	}

	main();
}());
