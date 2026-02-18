/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, afterEach } from 'vitest';
import { act } from 'react';
import { AppRig } from './AppRig.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('AppRig', () => {
  let rig: AppRig | undefined;

  afterEach(async () => {
    await rig?.unmount();
  });

  it('should render the app and handle a simple message', async () => {
    const fakeResponsesPath = path.join(
      __dirname,
      'fixtures',
      'simple.responses',
    );
    rig = new AppRig({ fakeResponsesPath });
    await rig.initialize();
    await act(async () => {
      rig!.render();
      // Allow async initializations (like banners) to settle within the act boundary
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    // Wait for initial render
    await rig.waitForIdle();

    // Type a message
    await rig.type('Hello');
    await rig.pressEnter();

    // Wait for model response
    await rig.waitForOutput('Hello! How can I help you today?');
  });
});
