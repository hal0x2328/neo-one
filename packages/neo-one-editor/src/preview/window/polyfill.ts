// tslint:disable no-object-mutation strict-type-predicates no-import-side-effect
import '@babel/polyfill';

if (typeof window !== 'undefined') {
  // @ts-ignore
  process.stdout = {
    isTTY: undefined,
  };

  // tslint:disable-next-line no-any
  (window as any)._trackJs = {
    token: 'ccff2c276a494f0b94462cdbf6bf4518',
    application: 'neo-one',
  };
  // tslint:disable-next-line
  const trackJs = require('trackjs');
  trackJs.addMetadata('type', 'preview');
}