/// <reference types="@neo-one/types/e2e"/>

describe('@neo-one/utils', () => {
  test('time to require', async () => {
    const time = await one.measureRequire('@neo-one/utils');
    expect(time).toBeLessThan(300);
  });
});
