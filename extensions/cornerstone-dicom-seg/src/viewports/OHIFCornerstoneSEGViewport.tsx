import React, { useCallback, useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import OHIF, { utils } from '@ohif/core';
import classNames from 'classnames';
import { eventTarget, cache, Enums } from '@cornerstonejs/core';
import { segmentation as cstSegmentation } from '@cornerstonejs/tools';
import {
  Notification,
  ViewportActionBar,
  useViewportGrid,
  useViewportDialog,
  Icon,
  Tooltip,
  LoadingIndicatorProgress,
} from '@ohif/ui';

import createSEGToolGroupAndAddTools from '../utils/initSEGToolGroup';
import _hydrateSEGDisplaySet from '../utils/_hydrateSEG';
import promptHydrateSEG from '../utils/promptHydrateSEG';

const { formatDate } = utils;
const SEG_TOOLGROUP_BASE_NAME = 'SEGToolGroup';

function OHIFCornerstoneSEGViewport(props) {
  const {
    children,
    displaySets,
    viewportOptions,
    viewportIndex,
    viewportLabel,
    servicesManager,
    extensionManager,
  } = props;

  const {
    DisplaySetService,
    ToolGroupService,
    SegmentationService,
  } = servicesManager.services;

  const toolGroupId =
    viewportOptions.toolGroupId ??
    `${SEG_TOOLGROUP_BASE_NAME}-${viewportIndex}`;

  // SEG viewport will always have a single display set
  if (displaySets.length > 1) {
    throw new Error('SEG viewport should only have a single display set');
  }

  const segDisplaySet = displaySets[0];

  const [viewportGrid, viewportGridService] = useViewportGrid();
  const [viewportDialogState, viewportDialogApi] = useViewportDialog();

  // States
  const [isToolGroupCreated, setToolGroupCreated] = useState(false);
  const [selectedSegment, setSelectedSegment] = useState(1);
  const [isHydrated, setIsHydrated] = useState(segDisplaySet.isHydrated);
  const [element, setElement] = useState(null);
  const [segIsLoading, setSegIsLoading] = useState(!segDisplaySet.isLoaded);

  // refs
  const referencedDisplaySetRef = useRef(null);

  const { viewports, activeViewportIndex } = viewportGrid;

  const referencedDisplaySet = segDisplaySet.getReferenceDisplaySet();
  const referencedDisplaySetMetadata = _getReferencedDisplaySetMetadata(
    referencedDisplaySet
  );

  referencedDisplaySetRef.current = {
    displaySet: referencedDisplaySet,
    metadata: referencedDisplaySetMetadata,
  };
  /**
   * OnElementEnabled callback which is called after the cornerstoneExtension
   * has enabled the element. Note: we delegate all the image rendering to
   * cornerstoneExtension, so we don't need to do anything here regarding
   * the image rendering, element enabling etc.
   */
  const onElementEnabled = evt => {
    setElement(evt.detail.element);
  };

  const onElementDisabled = () => {
    setElement(null);
  };

  const getCornerstoneViewport = useCallback(() => {
    const { component: Component } = extensionManager.getModuleEntry(
      '@ohif/extension-cornerstone.viewportModule.cornerstone'
    );

    const {
      displaySet: referencedDisplaySet,
    } = referencedDisplaySetRef.current;

    // Todo: jump to the center of the first segment

    return (
      <Component
        {...props}
        displaySets={[referencedDisplaySet, segDisplaySet]}
        viewportOptions={{
          viewportType: 'volume',
          toolGroupId: toolGroupId,
          orientation: viewportOptions.orientation,
        }}
        onElementEnabled={onElementEnabled}
        onElementDisabled={onElementDisabled}
        // initialImageIndex={initialImageIndex}
      ></Component>
    );
  }, [viewportIndex, segDisplaySet, toolGroupId]);

  const onSegmentChange = useCallback(
    direction => {
      direction = direction === 'left' ? -1 : 1;
      const segmentationId = segDisplaySet.displaySetInstanceUID;
      const segmentation = SegmentationService.getSegmentation(segmentationId);

      const { segments } = segmentation;

      const numberOfSegments = Object.keys(segments).length;

      let newSelectedSegmentIndex = selectedSegment + direction;

      if (newSelectedSegmentIndex > numberOfSegments - 1) {
        newSelectedSegmentIndex = 1;
      } else if (newSelectedSegmentIndex === 0) {
        newSelectedSegmentIndex = numberOfSegments - 1;
      }

      SegmentationService.jumpToSegmentCenter(
        segmentationId,
        newSelectedSegmentIndex,
        toolGroupId
      );
      setSelectedSegment(newSelectedSegmentIndex);
    },
    [selectedSegment]
  );

  useEffect(() => {
    if (segIsLoading) {
      return;
    }

    promptHydrateSEG({
      servicesManager,
      viewportIndex,
      segDisplaySet,
    }).then(isHydrated => {
      if (isHydrated) {
        setIsHydrated(true);
      }
    });
  }, [servicesManager, viewportIndex, segDisplaySet, segIsLoading]);

  useEffect(() => {
    const { unsubscribe } = SegmentationService.subscribe(
      SegmentationService.EVENTS.SEGMENTATION_PIXEL_DATA_CREATED,
      evt => {
        if (
          evt.segDisplaySet.displaySetInstanceUID ===
          segDisplaySet.displaySetInstanceUID
        ) {
          setSegIsLoading(false);
        }
      }
    );

    return () => {
      unsubscribe();
    };
  }, [segDisplaySet]);

  /**
   Cleanup the SEG viewport when the viewport is destroyed
   */
  useEffect(() => {
    const onDisplaySetsRemovedSubscription = DisplaySetService.subscribe(
      DisplaySetService.EVENTS.DISPLAY_SETS_REMOVED,
      ({ displaySetInstanceUIDs }) => {
        const activeViewport = viewports[activeViewportIndex];
        if (
          displaySetInstanceUIDs.includes(activeViewport.displaySetInstanceUID)
        ) {
          viewportGridService.setDisplaySetsForViewport({
            viewportIndex: activeViewportIndex,
            displaySetInstanceUIDs: [],
          });
        }
      }
    );

    return () => {
      onDisplaySetsRemovedSubscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let toolGroup = ToolGroupService.getToolGroup(toolGroupId);

    if (toolGroup) {
      return;
    }

    toolGroup = createSEGToolGroupAndAddTools(
      ToolGroupService,
      toolGroupId,
      extensionManager
    );

    setToolGroupCreated(true);

    return () => {
      // remove the segmentation representations if seg displayset changed
      SegmentationService.removeSegmentationRepresentationFromToolGroup(
        toolGroupId
      );

      ToolGroupService.destroyToolGroup(toolGroupId);
    };
  }, []);

  useEffect(() => {
    setIsHydrated(segDisplaySet.isHydrated);

    return () => {
      // remove the segmentation representations if seg displayset changed
      SegmentationService.removeSegmentationRepresentationFromToolGroup(
        toolGroupId
      );
      referencedDisplaySetRef.current = null;
    };
  }, [segDisplaySet]);

  // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  let childrenWithProps = null;

  if (
    !referencedDisplaySetRef.current ||
    referencedDisplaySet.displaySetInstanceUID !==
      referencedDisplaySetRef.current.displaySet.displaySetInstanceUID
  ) {
    return null;
  }

  if (children && children.length) {
    childrenWithProps = children.map((child, index) => {
      return (
        child &&
        React.cloneElement(child, {
          viewportIndex,
          key: index,
        })
      );
    });
  }

  const {
    PatientID,
    PatientName,
    PatientSex,
    PatientAge,
    SliceThickness,
    ManufacturerModelName,
    StudyDate,
    SeriesDescription,
    SpacingBetweenSlices,
    SeriesNumber,
  } = referencedDisplaySetRef.current.metadata;

  const onPillClick = () => {
    promptHydrateSEG({
      servicesManager,
      viewportIndex,
      segDisplaySet,
    }).then(isHydrated => {
      if (isHydrated) {
        setIsHydrated(true);
      }
    });
  };

  return (
    <>
      <ViewportActionBar
        onDoubleClick={evt => {
          evt.stopPropagation();
          evt.preventDefault();
        }}
        onSeriesChange={onSegmentChange}
        getStatusComponent={() => {
          return _getStatusComponent({
            isHydrated,
            onPillClick,
          });
        }}
        studyData={{
          label: viewportLabel,
          useAltStyling: true,
          studyDate: formatDate(StudyDate),
          currentSeries: SeriesNumber,
          seriesDescription: `SEG Viewport ${SeriesDescription}`,
          patientInformation: {
            patientName: PatientName
              ? OHIF.utils.formatPN(PatientName.Alphabetic)
              : '',
            patientSex: PatientSex || '',
            patientAge: PatientAge || '',
            MRN: PatientID || '',
            thickness: SliceThickness ? `${SliceThickness.toFixed(2)}mm` : '',
            spacing:
              SpacingBetweenSlices !== undefined
                ? `${SpacingBetweenSlices.toFixed(2)}mm`
                : '',
            scanner: ManufacturerModelName || '',
          },
        }}
      />

      <div className="relative flex flex-row w-full h-full overflow-hidden">
        {segIsLoading && <LoadingIndicatorProgress className="w-full h-full" />}
        {getCornerstoneViewport()}
        <div className="absolute w-full">
          {viewportDialogState.viewportIndex === viewportIndex && (
            <Notification
              id="viewport-notification"
              message={viewportDialogState.message}
              type={viewportDialogState.type}
              actions={viewportDialogState.actions}
              onSubmit={viewportDialogState.onSubmit}
              onOutsideClick={viewportDialogState.onOutsideClick}
            />
          )}
        </div>
        {childrenWithProps}
      </div>
    </>
  );
}

OHIFCornerstoneSEGViewport.propTypes = {
  displaySets: PropTypes.arrayOf(PropTypes.object),
  viewportIndex: PropTypes.number.isRequired,
  dataSource: PropTypes.object,
  children: PropTypes.node,
  customProps: PropTypes.object,
};

OHIFCornerstoneSEGViewport.defaultProps = {
  customProps: {},
};

function _getStatusComponent({ isHydrated, onPillClick }) {
  let ToolTipMessage = null;
  let StatusIcon = null;

  switch (isHydrated) {
    case true:
      StatusIcon = () => (
        <div
          className="flex items-center justify-center -mr-1 rounded-full"
          style={{
            width: '18px',
            height: '18px',
            backgroundColor: '#98e5c1',
            border: 'solid 1.5px #000000',
          }}
        >
          <Icon
            name="exclamation"
            style={{ color: '#000', width: '12px', height: '12px' }}
          />
        </div>
      );

      ToolTipMessage = () => (
        <div>This Segmentation is loaded in the segmentation panel</div>
      );
      break;
    case false:
      StatusIcon = () => (
        <div
          className="flex items-center justify-center -mr-1 bg-white rounded-full group-hover:bg-customblue-200"
          style={{
            width: '18px',
            height: '18px',
            border: 'solid 1.5px #000000',
          }}
        >
          <Icon
            name="arrow-left"
            style={{ color: '#000', width: '14px', height: '14px' }}
          />
        </div>
      );

      ToolTipMessage = () => <div>Click to load segmentation.</div>;
  }

  const StatusPill = () => (
    <div
      className={classNames(
        'group relative flex items-center justify-center px-8 rounded-full cursor-default bg-customgreen-100',
        {
          'hover:bg-customblue-100': !isHydrated,
          'cursor-pointer': !isHydrated,
        }
      )}
      style={{
        height: '24px',
        width: '55px',
      }}
      onClick={() => {
        if (!isHydrated) {
          if (onPillClick) {
            onPillClick();
          }
        }
      }}
    >
      <div className="pr-1 text-base font-medium leading-none text-black">
        SEG
      </div>
      <StatusIcon />
    </div>
  );

  return (
    <>
      {ToolTipMessage && (
        <Tooltip content={<ToolTipMessage />} position="bottom-left">
          <StatusPill />
        </Tooltip>
      )}
      {!ToolTipMessage && <StatusPill />}
    </>
  );
}

function _getReferencedDisplaySetMetadata(referencedDisplaySet) {
  const image0 = referencedDisplaySet.images[0];
  const referencedDisplaySetMetadata = {
    PatientID: image0.PatientID,
    PatientName: image0.PatientName,
    PatientSex: image0.PatientSex,
    PatientAge: image0.PatientAge,
    SliceThickness: image0.SliceThickness,
    StudyDate: image0.StudyDate,
    SeriesDescription: image0.SeriesDescription,
    SeriesInstanceUID: image0.SeriesInstanceUID,
    SeriesNumber: image0.SeriesNumber,
    ManufacturerModelName: image0.ManufacturerModelName,
    SpacingBetweenSlices: image0.SpacingBetweenSlices,
  };

  return referencedDisplaySetMetadata;
}

export default OHIFCornerstoneSEGViewport;
