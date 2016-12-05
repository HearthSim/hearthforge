// Photoshop JSX

app.preferences.rulerUnits = Units.PIXELS;

var referenceLayer = "reference",
	outputDir = "extract",
	padding = 20,
	doc = app.activeDocument,
	jsonFile, outputPath, baseName;
	
var pngOpts = new ExportOptionsSaveForWeb();
pngOpts.PNG8 = false;
pngOpts.transparency = true;
pngOpts.interlaced = false;
pngOpts.quality = 100;
pngOpts.includeProfile = false;
pngOpts.format = SaveDocumentType.PNG;
	
function main() {
	var dims, offset, json;
	
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
		width: dims[2] - dims[0],
		height: dims[3] - dims[1],
		components: []
	};
	// for each layer
	// get bounds, adjust by offset
	// write layerset idx, name, coords to json
	// copy layer trim and save to layer name in export dir
	for (var i = 0; i < doc.layerSets.length; i++) {
		var group = doc.layerSets[i];
		if (group.name == "IGNORE" || group.name == "BACKGROUND")
			continue;		

		// handle any regular layers
		for (var j = 0; j < group.artLayers.length; j++) {
			handleLayer(group.artLayers[j], "", json, outputPath, offset, i);
		}
		
		// handle any layer groups
		for (var j = 0; j < group.layerSets.length; j++) {
			var prefix = group.layerSets[j].name + "_";
			for (var k = 0; k < group.layerSets[j].artLayers.length; k++) {
				handleLayer(group.layerSets[j].artLayers[k], prefix, json, outputPath, offset, i);
			}
		}
	}
	
	var text = json.toSource().replace(/\(|\)/g, "");
	writeTextFile(jsonFile, text);
}

function handleLayer(layer, prefix, json, out, offset, level) {
		var tempDoc = app.documents.add(doc.width, doc.height, doc.resolution, "trim", NewDocumentMode.RGB, DocumentFill.TRANSPARENT);
		app.activeDocument = doc;
		var trimLayer = layer.duplicate(tempDoc, ElementPlacement.PLACEATBEGINNING);

		app.activeDocument = tempDoc;
		tempDoc.trim(TrimType.TRANSPARENT);
		var file = new File(out + "/" + prefix + layer.name + ".png");
		tempDoc.exportDocument(file, ExportType.SAVEFORWEB, pngOpts);

		var bounds = getLayerBounds(layer);
		json.components.push({
			layer: level,
			name: prefix + layer.name,
			x: bounds[0] - offset[0],
			y: bounds[1] - offset[1],
			width: bounds[2] - bounds[0],
			height: bounds[3] - bounds[1]
		});

		app.activeDocument = doc;
		tempDoc.close(SaveOptions.DONOTSAVECHANGES);
}

function addPadding(arr, pad) {
	// TODO need to check there is enough space
	arr[0] -= pad;
	arr[1] -= pad;
	arr[2] += pad;
	arr[3] += pad;
}

function getLayerBounds(layer)
{
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
	
function writeTextFile(afilename, output)
{
  var txtFile = new File(afilename);
  txtFile.open("w");
  txtFile.writeln(output);
  txtFile.close();
}
	
main();
