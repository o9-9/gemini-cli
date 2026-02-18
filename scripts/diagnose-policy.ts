/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { createPolicyEngineConfig } from '../packages/core/src/policy/config.js';
import { PolicyEngine } from '../packages/core/src/policy/policy-engine.js';
import { loadSettings } from '../packages/cli/src/config/settings.js';
import { stableStringify } from '../packages/core/src/policy/stable-stringify.js';
import { ApprovalMode } from '../packages/core/src/policy/types.js';

async function diagnose() {
  console.log('--- DIAGNOSTIC START ---');
  const targetDir = process.argv[2] || process.cwd();
  console.log('Target Dir:', targetDir);

  // 1. Load Settings
  const loadedSettings = loadSettings(targetDir);
  console.log('Settings Errors:', loadedSettings.errors);
  const settings = loadedSettings.merged;
  console.log('Settings loaded (Full):', JSON.stringify(settings, null, 2));

  // 2. Load Policy Engine
  console.log('Loading Policy Engine...');
  const policyConfig = await createPolicyEngineConfig(
    settings,
    ApprovalMode.PLAN,
    undefined,
    targetDir,
  );

  const engine = new PolicyEngine(policyConfig);

  // 3. Dump Rules for write_file
  console.log('');
  console.log('--- RULES FOR write_file ---');
  const rules = engine.getRules();
  const writeRules = rules.filter(
    (r) => !r.toolName || r.toolName === 'write_file',
  );

  if (writeRules.length === 0) {
    console.log('NO RULES FOUND for write_file!');
  }

  for (const rule of writeRules) {
    console.log(
      `[Rule] P=${rule.priority} Decision=${rule.decision} Source=${rule.source}`,
    );
    if (rule.argsPattern) {
      console.log(`       Regex: ${rule.argsPattern.source}`);
    }
    if (rule.modes) {
      console.log(`       Modes: ${rule.modes.join(', ')}`);
    }
  }

  // 4. Simulate Failure
  console.log('');
  console.log('--- SIMULATION ---');
  const args = {
    file_path: 'conductor/product.md',
    content: '# Initial Concept',
  };
  const stringified = stableStringify(args);
  console.log(`Stringified Args: ${stringified}`);

  const toolCall = { name: 'write_file', args };

  // Check against each rule manually
  console.log('');
  console.log('Matching against rules:');
  for (const rule of writeRules) {
    let match = true;
    if (rule.toolName && rule.toolName !== 'write_file') match = false;
    if (rule.modes && !rule.modes.includes(ApprovalMode.PLAN)) match = false;

    let regexMatch = null;
    if (rule.argsPattern) {
      regexMatch = rule.argsPattern.test(stringified);
      if (!regexMatch) match = false;
    }

    console.log(`Rule (P=${rule.priority}): Match=${match}`);
    if (rule.argsPattern) {
      console.log(
        `   Regex Test ('${rule.argsPattern.source}' vs '${stringified}'): ${regexMatch}`,
      );
    }
  }

  const result = await engine.check(toolCall, undefined);
  console.log('');
  console.log('--- FINAL RESULT ---');
  console.log('Decision:', result.decision);
  if (result.rule) {
    console.log('Matched Rule Source:', result.rule.source);
    console.log('Matched Rule Priority:', result.rule.priority);
  } else {
    console.log('No rule matched (Implicit Allow?)');
  }
}

diagnose().catch(console.error);
