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
	var defaultTypeName = "default";
	var defaultImageLayer = "default";
	var disabledLabel = "disabled";
	var noSaveLabel = "nosave";
	var logger = createLog("decompose.log");
	var config = loadConfig("decompose.cfg");
	var reGroupName = /(\d+)\s+(\w+)\s*(\w+)?/;
	var reTextLayer = /^text/;
	var reDefaultLayer = /^default/;
	var reClipLayer = /^clip\s+(\w+)/;
	var rePathLayer = /^path\s+(\w+)/;
	var jsonFile, baseName, basePath, offset;

	function main() {
		var json, layer, cardGroup, crop,
			i, j, k, l, q, p, regionBounds, point, pathItems, layerName;

		// init json and file names
		baseName = doc.name.substring(0, doc.name.length - 4);
		basePath = app.activeDocument.path + "/" + baseName;
		mkdir(basePath);
		jsonFile = basePath + "/data.json";
		logger.log("Processing " + doc.name);
		// use the cardCrop in the config (different for each theme)
		// to set the required card dimensions, based on the original assets.
		// (x, y) is the top left coord and is the offset to adjust for.
		crop = config.cardCrop[baseName];
		// add new json object, with (w, h) to use
		json = { "name": baseName, "width": crop.width, "height": crop.height };
		offset = [crop.x, crop.y];
		// walk the layer group hierarchy
		// top level groups - card types (separate premium and all variants)

		// get all top level group names first
		var defaultType, includedTypes = [];
		for (p = 0; p < doc.layerSets.length; p++) {
			// if there is a default type set it
			if (doc.layerSets[p].name === defaultTypeName) {
				defaultType = doc.layerSets[p];
				continue;
			}
			// exclude types specified in the config
			if (config.exclude.length <= 0) {
				// nothing to exclude use the type
				includedTypes.push(doc.layerSets[p]);
			} else {
				// compare type to excluded
				var include = true;
				for (q = 0; q < config.exclude.length; q++) {
					if (doc.layerSets[p].name == config.exclude[q]) {
						include = false;
						break;
					}
				}
				// if this type is not excluded than use it
				if (include) {
					logger.log("including " + doc.layerSets[p].name);
					includedTypes.push(doc.layerSets[p]);
				}
			}
		}
		// if there is a default type defined use it as a base for other types
		var defaultJson = {};
		defaultJson[defaultTypeName] = {};
		if (defaultType !== undefined) {
			processType(defaultType, defaultJson);
		}
		// process all other included layers, overwriting the default if applicable
		for (l = 0; l < includedTypes.length; l++) {
			cardGroup = includedTypes[l];
			json[cardGroup.name] = {};
			// if there is a default type, use it as the base data
			if (defaultType !== undefined) {
				json[cardGroup.name] = clone(defaultJson[defaultTypeName]);
			}
			processType(cardGroup, json);
		}
		// save the json to file
		logger.log("Creating json");
		var text = JSON.stringify(json, null, 4);
		writeTextToFile(jsonFile, text);
		alert("Decomposition Complete.");
		logger.close();
	}

	function processType(cardGroup, json) {
		var i, j, outputPath, prefix, layerIndex, group, result, imageName;
		// set the output dir for this card type
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
			if (result !== null && result.length > 1) {
				layerIndex = parseInt(result[1], 10);
				if (result.length > 2) {
					prefix = result[2];
					// check for a custom group, handle differently to normal
					if (result.length > 3 && result[3] !== undefined) {
						if (result[3] === disabledLabel) {
							// if the group is marked as diabled, clear any inherited base properties
							json[cardGroup.name][prefix] = undefined;
						} else {
							handleCustom(baseName, group.artLayers, result[3], json, outputPath, offset, cardGroup.name, layerIndex, prefix);
						}
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
				layer  = group.artLayers[j];
				if (processText(layer.name, layer, json[cardGroup.name][prefix]))
					continue;
				else if (processImage(cardGroup.name, layer.name, prefix, layer, json[cardGroup.name][prefix], outputPath))
					continue;
				else if (processClip(cardGroup.name, layer.name, prefix, json[cardGroup.name][prefix]))
					continue;
				else if (processCurve(layer.name, json[cardGroup.name][prefix]))
					continue;
				else
				{
					// it is assumed to be a multi image group
					imageName = prefix + "_" + layer.name + fileExt;
					handleImage(layer, imageName, cardGroup.name, outputPath,  json[cardGroup.name][prefix]);
				}
			}
		}
	}

	// check if its a 'Text' layer and handle it
	function processText(layerName, layer, json) {
		var success = false,
			result = reTextLayer.exec(layerName),
			regionBounds;

		if (result !== null) {
			logger.log("Handling Text layer (" + layerName + ")");
			regionBounds = getLayerBounds(layer);
			json["text"] = {
				"x": regionBounds[0] - offset[0],
				"y": regionBounds[1] - offset[1],
				"width": regionBounds[2] - regionBounds[0],
				"height": regionBounds[3] - regionBounds[1]
			};
			success = true;
		}
		return success;
	}

	// check if its a single 'Default' layer
	function processImage(groupName, layerName, prefix, layer, json, output) {
		var imageName, success = false,
			result = reDefaultLayer.exec(layerName);
		if (result !== null) {
			handleImage(layer, prefix + fileExt, groupName, output, json);
			success = true;
		}
		return success;
	}

	// check if its a clipping layer, will try to find a matching path
	function processClip(groupName, layerName, prefix, json) {
		var success = false,
			result = reClipLayer.exec(layerName);
		if (result !== null && result.length >= 2) {
			logger.log("Handling Clip layer (" + layerName + ")");
			if (result[1] == "polygon") {
				json["clip"] = {
					"type": result[1],
					"points": pathPoints(groupName + "_" + prefix + "_clip", offset)
				};
			} else {
				// an old style clip shape
				logger.log("WARNING: Unknown clip type, " + result[1]);
			}
			success = true; // well it matched at least, so don't match anything else
		}
		return success;
	}

	// check if its a simple Bezier curve
	function processCurve(layerName, json) {
		var success = false,
			result = rePathLayer.exec(layerName);
		if (result !== null && result.length >= 2) {
			logger.log("Handling path (curve) layer: " + result[1]);
			addSimpleCurve(result[1], json, offset);
			success = true;
		}
		return success;
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
				handleImage(group[i], "custom_" + group[i].name + fileExt, type, out, json["custom"][name]);
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

	// use the layer bounds to calc (x, y, w, h) and add to json obj
	function addImageData(layer, json) {
		var bounds = getLayerBounds(layer);
		json["image"]["x"] = bounds[0] - offset[0];
		json["image"]["y"] = bounds[1] - offset[1];
		json["image"]["width"] = bounds[2] - bounds[0];
		json["image"]["height"] = bounds[3] - bounds[1];
	}

	// trim the layer and save the image to file
	function addImageAsset(layer, file) {
		if (!config.jsonOnly) {
			var tempDoc = app.documents.add(doc.width, doc.height, doc.resolution,
				"trim", NewDocumentMode.RGB, DocumentFill.TRANSPARENT);
			app.activeDocument = doc;
			var trimLayer = layer.duplicate(tempDoc, ElementPlacement.PLACEATBEGINNING);
			app.activeDocument = tempDoc;
			tempDoc.trim(TrimType.TRANSPARENT);
			tempDoc.exportDocument(file, ExportType.SAVEFORWEB, pngOpts);
			app.activeDocument = doc;
			tempDoc.close(SaveOptions.DONOTSAVECHANGES);
		}
	}

	function handleImage(layer, imageName, typeName, outDir, json) {
		var defaultAssetName,
			writeFile = layer.name !== noSaveLabel,
			file = new File(outDir + "/" + imageName);
		logger.log("Handling image layer (" + layer.name + ")");
		if (json["image"] === undefined) {
			logger.log("Initializing json obj for image " + imageName);
			json["image"] = {};
			json["image"]["assets"] = {};
			if (writeFile) {
				json["image"]["assets"][layer.name] = typeName + "/" + imageName;
				addImageAsset(layer, file);
			}
			addImageData(layer, json);
		} else {
			// the obj could be a multi image group or inherits from base type
			defaultAssetName = defaultTypeName + "/" + imageName;
			if (json["image"]["assets"][layer.name] === defaultAssetName) {
				// don't write a new image, just image data (assume it exists)
				logger.log("Overwriting image data for " + imageName);
				addImageData(layer, json);
			} else if (writeFile) {
				// must be a multi image group, just write the image
				logger.log("Add image asset part of multi group, " + imageName);
				json["image"]["assets"][layer.name] = typeName + "/" + imageName;
				addImageAsset(layer, file);
			}
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

	// clone an object
	function clone(obj) {
		return JSON.parse(JSON.stringify(obj))
	}

	main();
})();
