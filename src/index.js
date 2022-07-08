import "vtk.js/Sources/favicon";
import "vtk.js/Sources/Rendering/Profiles/Geometry";
import vtkActor from "vtk.js/Sources/Rendering/Core/Actor";
import vtkFullScreenRenderWindow from "vtk.js/Sources/Rendering/Misc/FullScreenRenderWindow";
import vtkMapper from "vtk.js/Sources/Rendering/Core/Mapper";
import vtkXMLPolyDataReader from "vtk.js/Sources/IO/XML/XMLPolyDataReader";
import vtkSTLReader from "vtk.js/Sources/IO/Geometry/STLReader";
import vtkColorTransferFunction from "vtk.js/Sources/Rendering/Core/ColorTransferFunction";
import vtkColorMaps from "vtk.js/Sources/Rendering/Core/ColorTransferFunction/ColorMaps";
//import controlPanel from "./controller.html";
import vtkHttpDataAccessHelper from "vtk.js/Sources/IO/Core/DataAccessHelper/HttpDataAccessHelper";
import vtkScalarBarActor from "vtk.js/Sources/Rendering/Core/ScalarBarActor";
import vtkDataArray from "vtk.js/Sources/Common/Core/DataArray";
import * as fs from 'fs';
import {
  ColorMode,
  ScalarMode,
} from "vtk.js/Sources/Rendering/Core/Mapper/Constants";
import { stringify } from "querystring";

const { fetchBinary } = vtkHttpDataAccessHelper;

let fullScreenRenderWindow;
let renderWindow;
let renderer;
let scalarBarActor;
let lutName;
let field;
let background = [0, 0, 0];
let timeSeriesData = [];

function downloadTimeSeries() {
  var files = [];
  console.log(fs);
  files = fs.readdirSync("../dist/examples/time-series").filter(function(file){
    return file.match(/time-series_*.vtp$/);
  });
    files.map((filename) =>
      fetchBinary(`..\\dist\\examples\\time-series/${filename}`).then(
        (binary) => {
          const reader = vtkXMLPolyDataReader.newInstance();
          reader.parseAsArrayBuffer(binary);
          return reader.getOutputData(0);
        }
      )
  );
}

function createViewer() {
  fullScreenRenderWindow = vtkFullScreenRenderWindow.newInstance({
    background,
  });
  renderer = fullScreenRenderWindow.getRenderer();
  renderWindow = fullScreenRenderWindow.getRenderWindow();

  scalarBarActor = vtkScalarBarActor.newInstance();
  renderer.addActor(scalarBarActor);
}

function update(timeSeries) {
  document
    .getElementById("timeSlider")
    .setAttribute("max", String(timeSeriesData.length - 1));

  const lookupTable = vtkColorTransferFunction.newInstance();
  let activeDataset = timeSeries[0];
  const mapper = vtkMapper.newInstance({
    interpolateScalarsBeforeMapping: false,
    useLookupTableScalarRange: true,
    lookupTable,
    scalarVisibility: false,
  });

  const actor = vtkActor.newInstance();
  const scalars = activeDataset.getPointData().getScalars();
  const dataRange = [].concat(scalars ? scalars.getRange() : [0, 1]);
  let activeArray = vtkDataArray;
  //STL file rendering

  const STLreader = vtkSTLReader.newInstance();
  const STLmapper = vtkMapper.newInstance();
  const STLactor = vtkActor.newInstance();
  STLactor.setMapper(STLmapper);
  STLmapper.setInputConnection(STLreader.getOutputPort());

  // --------------------------------------------------------------------
  // STL file handling
  // --------------------------------------------------------------------

  function handleSTLFile(event) {
    renderer.removeActor(STLactor);
    event.preventDefault();
    const dataTransfer = event.dataTransfer;
    const files = event.target.files || dataTransfer.files;
    if (files.length === 1) {
      const fileReader = new FileReader();
      fileReader.onload = function onLoad(e) {
        STLreader.parseAsArrayBuffer(fileReader.result);
      };
      fileReader.readAsArrayBuffer(files[0]);
      renderer.addActor(STLactor);
      renderWindow.render();
    }
  }

  // --------------------------------------------------------------------
  // Color handling
  // --------------------------------------------------------------------

  function applyPreset() {
    const preset = vtkColorMaps.getPresetByName(
      document.getElementById("presetSelector").value
    );
    lookupTable.applyColorMap(preset);
    lookupTable.setMappingRange(dataRange[0], dataRange[1]);
    lookupTable.updateRange();
    renderWindow.render();
  }
  applyPreset();

  // --------------------------------------------------------------------
  // Opacity handling
  // --------------------------------------------------------------------

  function updateOpacity(event) {
    const opacity = Number(event.target.value) / 100;
    actor.getProperty().setOpacity(opacity);
    renderWindow.render();
  }

  // --------------------------------------------------------------------
  // Particle Size handling
  // --------------------------------------------------------------------

  function updateParticleSize(event) {
    const particleSize = Number(event.target.value);
    actor.getProperty().setPointSize(particleSize);
    renderWindow.render();
  }

  // --------------------------------------------------------------------
  // ColorBy handling
  // --------------------------------------------------------------------

  const colorByOptions = [{ value: ":", label: "Solid color" }].concat(
    activeDataset
      .getPointData()
      .getArrays()
      .map((a) => ({
        label: `(p) ${a.getName()}`,
        value: `PointData:${a.getName()}`,
      })),
    activeDataset
      .getCellData()
      .getArrays()
      .map((a) => ({
        label: `(c) ${a.getName()}`,
        value: `CellData:${a.getName()}`,
      }))
  );
  document.getElementById("colorBySelector").innerHTML = colorByOptions
    .map(
      ({ label, value }) =>
        `<option value="${value}" ${
          field === value ? 'selected="selected"' : ""
        }>${label}</option>`
    )
    .join("");

  function updateColorBy(event) {
    const [location, colorByArrayName] = event.target.value.split(":");
    const interpolateScalarsBeforeMapping = location === "PointData";
    let colorMode = ColorMode.DEFAULT;
    let scalarMode = ScalarMode.DEFAULT;
    const scalarVisibility = location.length > 0;
    if (scalarVisibility) {
      const newArray = activeDataset[`get${location}`]().getArrayByName(
        colorByArrayName
      );
      activeArray = newArray;
      const newDataRange = activeArray.getRange();
      dataRange[0] = newDataRange[0];
      dataRange[1] = newDataRange[1];
      colorMode = ColorMode.MAP_SCALARS;
      scalarMode =
        location === "PointData"
          ? ScalarMode.USE_POINT_FIELD_DATA
          : ScalarMode.USE_CELL_FIELD_DATA;

      const numberOfComponents = activeArray.getNumberOfComponents();
      if (numberOfComponents > 1) {
        // always start on magnitude setting
        if (mapper.getLookupTable()) {
          const lut = mapper.getLookupTable();
          lut.setVectorModeToMagnitude();
        }
        document.getElementById("componentSelector").style.display = "block";
        const compOpts = ["Magnitude"];
        while (compOpts.length <= numberOfComponents) {
          compOpts.push(`Component ${compOpts.length}`);
        }
        document.getElementById("componentSelector").innerHTML = compOpts
          .map((t, index) => `<option value="${index - 1}">${t}</option>`)
          .join("");
      } else {
        document.getElementById("componentSelector").style.display = "none";
      }
      scalarBarActor.setAxisLabel(colorByArrayName);
      scalarBarActor.setVisibility(true);
    } else {
      document.getElementById("componentSelector").style.display = "none";
      scalarBarActor.setVisibility(false);
    }
    mapper.set({
      colorByArrayName,
      colorMode,
      interpolateScalarsBeforeMapping,
      scalarMode,
      scalarVisibility,
    });
    applyPreset();
  }
  updateColorBy({ target: document.getElementById("colorBySelector") });

  function updateColorByComponent(event) {
    if (mapper.getLookupTable()) {
      const lut = mapper.getLookupTable();
      if (event.target.value === -1) {
        lut.setVectorModeToMagnitude();
      } else {
        lut.setVectorModeToComponent();
        lut.setVectorComponent(Number(event.target.value));
        const newDataRange = activeArray.getRange(Number(event.target.value));
        dataRange[0] = newDataRange[0];
        dataRange[1] = newDataRange[1];
        lookupTable.setMappingRange(dataRange[0], dataRange[1]);
        lut.updateRange();
      }
      renderWindow.render();
    }
  }

  // --------------------------------------------------------------------
  // Time slider handling
  // --------------------------------------------------------------------

  function setVisibleDataset(ds) {
    mapper.setInputData(ds);
    scalarBarActor.setScalarsToColors(mapper.getLookupTable());
    //renderer.resetCamera();
    renderWindow.render();
  }

  function updateTimeDataset(event) {
    activeDataset = timeSeriesData[Number(event.target.value)];
    if (activeDataset) {
      setVisibleDataset(activeDataset);
    }
  }

  var myTimer;
  function startAnimation(event) {
    clearInterval(myTimer); 
    var timeStep = document.getElementById("timeSlider").value;
    var max = document.getElementById("timeSlider").max;
    myTimer = setInterval(function () {
      if (timeStep > max) {
        timeStep = 0;
        clearInterval(myTimer);
      } else {
        timeStep = String(parseInt(timeStep) + 1);
      }
      activeDataset = timeSeriesData[timeStep];
      if (activeDataset) {
        setVisibleDataset(activeDataset);
      }
      document.getElementById("timeSlider").value = timeStep;
    }, 500);
  }

  function stopAnimation(event) {
    clearInterval(myTimer);
  }

  //Adding Event Listeners
  document
    .getElementById("addSTLfile")
    .addEventListener("change", handleSTLFile);
  document
    .getElementById("presetSelector")
    .addEventListener("change", applyPreset);
  document
    .getElementById("colorBySelector")
    .addEventListener("change", updateColorBy);
  document
    .getElementById("componentSelector")
    .addEventListener("change", updateColorByComponent);
  document
    .getElementById("opacitySelector")
    .addEventListener("input", updateOpacity);
  document
    .getElementById("particleSizeSelector")
    .addEventListener("input", updateParticleSize);
  document
    .getElementById("timeSlider")
    .addEventListener("input", updateTimeDataset);
  document
    .getElementById("startButton")
    .addEventListener("click", startAnimation);
  document
    .getElementById("stopButton")
    .addEventListener("click", stopAnimation);
  // --------------------------------------------------------------------
  // Pipeline handling
  // --------------------------------------------------------------------

  actor.setMapper(mapper);
  renderer.addActor(actor);
  setVisibleDataset(activeDataset);
  renderer.resetCamera();
}

function createPipeline() {
  //Creating UI

  const addVTKfile = document.createElement("button");
  addVTKfile.innerHTML = "Simulate";

  const addSTLfile = document.createElement("div");
  addSTLfile.innerHTML = '<input type="file" class="file"/>';

  const presetSelector = document.createElement("select");
  presetSelector.innerHTML = vtkColorMaps.rgbPresetNames
    .map(
      (name) =>
        `<option value="${name}" ${
          lutName === name ? 'selected="selected"' : ""
        }>${name}</option>`
    )
    .join("");

  const colorBySelector = document.createElement("select");

  const componentSelector = document.createElement("select");
  componentSelector.style.display = "none";

  const opacitySelector = document.createElement("input");
  opacitySelector.setAttribute("type", "range");
  opacitySelector.setAttribute("value", "100");
  opacitySelector.setAttribute("max", "100");
  opacitySelector.setAttribute("min", "1");

  const particleSizeSelector = document.createElement("input");
  particleSizeSelector.setAttribute("type", "range");
  particleSizeSelector.setAttribute("value", "1");
  particleSizeSelector.setAttribute("max", "10");
  particleSizeSelector.setAttribute("min", "0.1");
  particleSizeSelector.setAttribute("step", "0.1");

  const timeSlider = document.createElement("input");
  timeSlider.setAttribute("type", "range");
  timeSlider.setAttribute("min", "0");
  timeSlider.setAttribute("value", "0");
  timeSlider.setAttribute("step", "1");

  const startButton = document.createElement("button");
  startButton.innerHTML = "Start";
  const stopButton = document.createElement("button");
  stopButton.innerHTML = "Stop";

  addVTKfile.id = "addVTKfile";
  addSTLfile.id = "addSTLfile";
  presetSelector.id = "presetSelector";
  colorBySelector.id = "colorBySelector";
  componentSelector.id = "componentSelector";
  opacitySelector.id = "opacitySelector";
  particleSizeSelector.id = "particleSizeSelector";
  timeSlider.id = "timeSlider";
  startButton.id = "startButton";
  stopButton.id = "stopButton";

  const controlContainer = document.createElement("div");
  controlContainer.classList.add("controlContainer");

  controlContainer.appendChild(addVTKfile);
  var linebreak = document.createElement("br");
  controlContainer.appendChild(linebreak);

  var lblAddSTLfile = document.createElement("label");
  lblAddSTLfile.textContent = "Add STL File: ";
  controlContainer.appendChild(lblAddSTLfile);
  controlContainer.appendChild(addSTLfile);
  var linebreak = document.createElement("br");
  controlContainer.appendChild(linebreak);

  var lblPresetSelector = document.createElement("label");
  lblPresetSelector.textContent = "Preset: ";
  controlContainer.appendChild(lblPresetSelector);
  controlContainer.appendChild(presetSelector);
  linebreak = document.createElement("br");
  controlContainer.appendChild(linebreak);

  var lblColorBySelector = document.createElement("label");
  lblColorBySelector.textContent = "Color By: ";
  controlContainer.appendChild(lblColorBySelector);
  controlContainer.appendChild(colorBySelector);
  linebreak = document.createElement("br");
  controlContainer.appendChild(linebreak);

  controlContainer.appendChild(componentSelector);

  var lblOpacitySelector = document.createElement("label");
  lblOpacitySelector.textContent = "Opacity: ";
  controlContainer.appendChild(lblOpacitySelector);
  controlContainer.appendChild(opacitySelector);
  linebreak = document.createElement("br");
  controlContainer.appendChild(linebreak);

  var lblParticleSizeSelector = document.createElement("label");
  lblParticleSizeSelector.textContent = "Particle Size: ";
  controlContainer.appendChild(lblParticleSizeSelector);
  controlContainer.appendChild(particleSizeSelector);
  linebreak = document.createElement("br");
  controlContainer.appendChild(linebreak);

  var lblTimeStampSelector = document.createElement("label");
  lblTimeStampSelector.textContent = "Time Stamp: ";
  controlContainer.appendChild(lblTimeStampSelector);
  controlContainer.appendChild(timeSlider);
  controlContainer.appendChild(startButton);
  controlContainer.appendChild(stopButton);

  fullScreenRenderWindow.addController(controlContainer.outerHTML);

  function handleVTKfile(event) {
    downloadTimeSeries().then((downloadedData) => {
      timeSeriesData = downloadedData;
      update(timeSeriesData);
    });
  }

  document
    .getElementById("addVTKfile")
    .addEventListener("click", handleVTKfile);
  //VTK pipeline

  //const vtpReader = vtkXMLPolyDataReader.newInstance();
  //vtpReader.parseAsArrayBuffer(fileContents);

  //  global.pipeline[fileName] = {
  //    actor,
  //    mapper,
  //    lookupTable,
  //   renderer,
  //  renderWindow,
  //  };
}

createViewer();
createPipeline();