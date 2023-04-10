import toolbarButtons from './toolbarButtons';
import { hotkeys, ServicesManager } from '@ohif/core';
import { id } from './id';

const configs = {
  Length: {},
  //
};

const ohif = {
  layout: '@ohif/extension-default.layoutTemplateModule.viewerLayout',
  sopClassHandler: '@ohif/extension-default.sopClassHandlerModule.stack',
  hangingProtocol: 'default',
  measurements: '@ohif/extension-default.panelModule.measure',
  thumbnailList: '@ohif/extension-default.panelModule.seriesList',
};

const cs3d = {
  viewport: '@ohif/extension-cornerstone.viewportModule.cornerstone',
};

const dicomsr = {
  sopClassHandler:
    '@ohif/extension-cornerstone-dicom-sr.sopClassHandlerModule.dicom-sr',
  viewport: '@ohif/extension-cornerstone-dicom-sr.viewportModule.dicom-sr',
};

const dicomvideo = {
  sopClassHandler:
    '@ohif/extension-dicom-video.sopClassHandlerModule.dicom-video',
  viewport: '@ohif/extension-dicom-video.viewportModule.dicom-video',
};

const dicompdf = {
  sopClassHandler: '@ohif/extension-dicom-pdf.sopClassHandlerModule.dicom-pdf',
  viewport: '@ohif/extension-dicom-pdf.viewportModule.dicom-pdf',
};

const extensionDependencies = {
  '@ohif/extension-default': '^3.0.0',
  '@ohif/extension-cornerstone': '^3.0.0',
  '@ohif/extension-cornerstone-dicom-sr': '^3.0.0',
  '@ohif/extension-dicom-pdf': '^3.0.1',
  '@ohif/extension-dicom-video': '^3.0.1',
};

const modeDefinition = {
  id,
  routeName: 'basic',
  displayName: 'Basic Viewer CS3D',

  toolGroupId: 'default',

  buttonSections: {
    primary: [
      'MeasurementTools',
      'Zoom',
      'WindowLevel',
      'Pan',
      'Layout',
      'MoreTools',
    ],
  },

  validationTags: {
    study: [],
    series: [],
  },

  excludeModalities: ['SM', 'ECG'],

  // A command to run on initial load to set the default tool
  defaultToolCommand: {
    groupId: 'WindowLevel',
    itemId: 'WindowLevel',
    interactionType: 'tool',
    commands: [
      {
        commandName: 'setToolActive',
        commandOptions: {
          toolName: 'WindowLevel',
        },
        context: 'CORNERSTONE',
      },
    ],
  },

  /**
   * Lifecycle hooks
   */
  onModeEnter: function onModeEnter({ servicesManager, extensionManager }) {
    const { toolbarService, toolGroupService } = servicesManager.services;
    if (!this.tools) {
      const utilityModule = extensionManager.getModuleEntry(
        '@ohif/extension-cornerstone.utilityModule.tools'
      );

      const { toolNames, Enums } = utilityModule.exports;

      this.tools = {
        active: [
          {
            toolName: toolNames.WindowLevel,
            bindings: [{ mouseButton: Enums.MouseBindings.Primary }],
          },
          {
            toolName: toolNames.Pan,
            bindings: [{ mouseButton: Enums.MouseBindings.Auxiliary }],
          },
          {
            toolName: toolNames.Zoom,
            bindings: [{ mouseButton: Enums.MouseBindings.Secondary }],
          },
          { toolName: toolNames.StackScrollMouseWheel, bindings: [] },
        ],
        passive: [
          { toolName: toolNames.Length },
          { toolName: toolNames.Bidirectional },
          { toolName: toolNames.Probe },
          { toolName: toolNames.EllipticalROI },
          { toolName: toolNames.RectangleROI },
          { toolName: toolNames.StackScroll },
          { toolName: toolNames.CalibrationLine },
        ],
        // enabled
        // disabled
      };
    }

    toolGroupService.createToolGroupAndAddTools(
      this.toolGroupId,
      this.tools,
      configs
    );

    let unsubscribe;

    const activateTool = () => {
      toolbarService.recordInteraction(this.defaultToolCommand);

      // We don't need to reset the active tool whenever a viewport is getting
      // added to the toolGroup.
      unsubscribe();
    };

    // Since we only have one viewport for the basic cs3d mode and it has
    // only one hanging protocol, we can just use the first viewport
    ({ unsubscribe } = toolGroupService.subscribe(
      toolGroupService.EVENTS.VIEWPORT_ADDED,
      activateTool
    ));

    toolbarService.init(extensionManager);
    toolbarService.addButtons(toolbarButtons);
    toolbarService.createButtonSection('primary', this.buttonSections.primary);
  },

  isValidMode: function isValidMode({ modalities = '' }) {
    const modalities_list = modalities.split('\\');

    return modalities_list.some(
      modality => this.excludeModalities.indexOf(modality) === -1
    );
  },

  routes: [
    {
      path: 'viewer-cs3d',
      /*init: ({ servicesManager, extensionManager }) => {
        //defaultViewerRouteInit
      },*/
      defaultRoutes: {
        id: ohif.layout,
        props: {
          // TODO: Should be optional, or required to pass empty array for slots?
          leftPanels: [ohif.thumbnailList],
          rightPanels: [ohif.measurements],
          viewports: [
            {
              namespace: cs3d.viewport,
              displaySetsToDisplay: [ohif.sopClassHandler],
            },
            {
              namespace: dicomvideo.viewport,
              displaySetsToDisplay: [dicomvideo.sopClassHandler],
            },
            {
              namespace: dicompdf.viewport,
              displaySetsToDisplay: [dicompdf.sopClassHandler],
            },
          ],
        },
      },

      layoutTemplate: function layoutTemplate() {
        return this.defaultRoutes;
      },
    },
  ],
  extensions: extensionDependencies,
  hangingProtocol: [ohif.hangingProtocol],
  sopClassHandlers: [
    dicomvideo.sopClassHandler,
    ohif.sopClassHandler,
    dicompdf.sopClassHandler,
    dicomsr.sopClassHandler,
  ],
  hotkeys: [...hotkeys.defaults.hotkeyBindings],
};

function modeFactory() {
  return this.modeDefinition;
}

const mode = {
  id,
  modeFactory,
  modeDefinition,
  extensionDependencies,
};

export default mode;
