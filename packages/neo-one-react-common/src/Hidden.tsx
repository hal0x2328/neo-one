// tslint:disable no-null-keyword no-object-mutation
import { Box, callAll, styledOmitProps } from '@neo-one/react-core';
import * as React from 'react';
import { css } from 'styled-components';
import { ifProp, prop, theme } from 'styled-tools';
import {
  excludeTransition,
  ExpandProps,
  getTransitionArray,
  hasTransition,
  OriginProps,
  originWithProps,
  scaleWithProps,
  SlideProps,
  slideWithProps,
  TransitionProps,
  TranslateProps,
  translateWithProps,
} from './transition';

const { forwardRef, useCallback, useEffect, useRef, useState, useReducer } = React;

export interface UseHiddenProps {
  readonly visible: boolean;
  readonly show: () => void;
  readonly hide: () => void;
  readonly toggle: () => void;
}

export interface UseHiddenProps {
  readonly visible: boolean;
  readonly show: () => void;
  readonly hide: () => void;
  readonly toggle: () => void;
}

interface HiddenAction {
  readonly type: string;
}

interface HiddenState {
  readonly visible: boolean;
}

const hiddenReducer = (state: HiddenState, action: HiddenAction) => {
  switch (action.type) {
    case 'show':
      return { visible: true };
    case 'hide':
      return { visible: false };
    case 'toggle':
      return { visible: !state.visible };
    default:
      throw new Error();
  }
};

export const useHidden = (propVisible = false) => {
  const [state, dispatch] = useReducer(hiddenReducer, { visible: propVisible });

  return {
    ...state,
    show: () => dispatch({ type: 'show' }),
    hide: () => dispatch({ type: 'hide' }),
    toggle: () => dispatch({ type: 'toggle' }),
  };
};

export interface HiddenProps extends TransitionProps, OriginProps, TranslateProps, ExpandProps, SlideProps {
  readonly visible?: boolean;
  readonly transitioning?: boolean;
  readonly unmount?: boolean;
  readonly hide?: () => void;
  readonly hideOnEsc?: boolean;
  readonly hideOnClickOutside?: boolean;
}

const HiddenComponent = forwardRef<HTMLDivElement, HiddenProps & React.ComponentPropsWithRef<typeof Box>>(
  (
    {
      visible: propVisible = false,
      transitioning: propTransitioning = false,
      unmount = false,
      hideOnEsc = false,
      hideOnClickOutside = false,
      hide,
      ...props
    },
    refIn,
  ) => {
    const myRef = useRef<HTMLDivElement>(null);
    const ref = refIn === null ? myRef : (refIn as React.RefObject<HTMLDivElement>);
    const [visible, setVisible] = useState(!!propVisible);
    const [transitioning, setTransitioning] = useState(!!propTransitioning);
    const refVisible = useRef(visible);
    refVisible.current = visible;

    const handleTransitionEnd = useCallback(() => {
      if (unmount && !propVisible) {
        setTransitioning(false);
      }
    }, [unmount, propVisible]);

    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape' && propVisible && hide) {
          hide();
        }
      };

      const handleClickOutside = (e: MouseEvent) => {
        const node = ref.current;

        // tslint:disable-next-line no-any
        if (node !== null && !node.contains(e.target as any) && propVisible && hide !== undefined) {
          setTimeout(() => {
            if (refVisible.current) {
              hide();
            }
          });
        }
      };

      if (hideOnEsc) {
        document.body.addEventListener('keydown', handleKeyDown);
      }

      if (hideOnClickOutside) {
        document.body.addEventListener('click', handleClickOutside);
      }

      return () => {
        document.body.removeEventListener('keydown', handleKeyDown);
        document.body.removeEventListener('click', handleClickOutside);
      };
    }, [propVisible, hide, ref, refVisible, hideOnEsc, hideOnClickOutside]);
    useEffect(() => {
      // tslint:disable-next-line strict-type-predicates
      if (typeof window !== 'undefined' && unmount && hasTransition(props)) {
        if (propVisible) {
          setTransitioning(true);
          requestAnimationFrame(() => {
            setTransitioning(false);
            setVisible(true);
          });
        } else {
          setTransitioning(true);
          setVisible(false);
        }
      } else {
        setVisible(propVisible);
      }
    }, [propVisible, setTransitioning, setVisible, ...getTransitionArray(props)]);

    if (unmount && !visible && !transitioning) {
      return null;
    }

    const rest = excludeTransition(props);

    return (
      <Box
        {...rest}
        ref={ref}
        aria-hidden={!visible}
        hidden={!visible && !hasTransition(props)}
        onTransitionEnd={callAll(handleTransitionEnd, rest.onTransitionEnd)}
      />
    );
  },
);

interface HiddenStyledProps {
  readonly duration?: string;
  readonly timing?: string;
  readonly delay?: string;
  readonly translateX?: string | number;
  readonly translateY?: string | number;
  readonly originX?: string | number;
  readonly originY?: string | number;
  // tslint:disable-next-line:no-any
  readonly defaultSlide: any;
  // tslint:disable-next-line:no-any
  readonly defaultExpand: any;
  readonly slideOffset?: string | number;
}

const hiddenTheme = theme('Hidden');

export const Hidden = styledOmitProps<HiddenStyledProps>(
  HiddenComponent,
  [
    'duration',
    'timing',
    'delay',
    'translateX',
    'translateY',
    'originX',
    'originY',
    'defaultSlide',
    'defaultExpand',
    'slideOffset',
  ],
  hiddenTheme,
)`
  transform: ${translateWithProps};
  ${ifProp(
    hasTransition,
    css`
      transform-origin: ${originWithProps};
      transition: all ${prop('duration')} ${prop('timing')} ${prop('delay')};
    `,
  )};
  &[aria-hidden='true'] {
    pointer-events: none;
    ${ifProp('fade', 'opacity: 0')};
    ${ifProp(
      hasTransition,
      css`
        transform: ${slideWithProps} ${scaleWithProps};
        visibility: hidden;
        will-change: transform, opacity;
      `,
      'display: none !important',
    )};
  }
  ${hiddenTheme};
`;

Hidden.defaultProps = {
  duration: '250ms',
  timing: 'ease-in-out',
};
