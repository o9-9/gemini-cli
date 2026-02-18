/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { PolicyEngine } from '../packages/core/src/policy/policy-engine.js';
import { loadPoliciesFromToml } from '../packages/core/src/policy/toml-loader.js';
import {
  PolicyDecision,
  ApprovalMode,
} from '../packages/core/src/policy/types.js';

describe('Policy Reproduction: Feb 17 Issue', () => {
  let tempDir: string;
  let policyDir: string;
  let conductorPolicyPath: string;

  beforeEach(async () => {
    // Create a clean sandbox
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gemini-repro-'));
    policyDir = path.join(tempDir, '.gemini', 'policies');
    await fs.mkdir(policyDir, { recursive: true });

    conductorPolicyPath = path.join(policyDir, 'conductor.toml');
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should MATCH the write_file tool call with single-quoted regex', async () => {
    // 1. Write the EXACT TOML content from user's environment (@../dev/feb17_13)
    const tomlContent = `
# Allow writing metadata.json files in plan mode
[[rule]]
toolName = ["write_file", "replace"]
priority = 100
decision = "allow"
modes = ["plan"]
argsPattern = '"(?:file_path|path)":"[^"]*conductor/'

# Allow git status/diff/ls for context awareness
[[rule]]
toolName = "run_shell_command"
commandPrefix = ["git status", "git diff", "ls", "mkdir", "cp", "git init"]
decision = "allow"
priority = 100
modes = ["plan"]
`;
    await fs.writeFile(conductorPolicyPath, tomlContent, 'utf-8');

    // 2. Load policies using the real loader
    // We simulate it being a "User" tier policy (Tier 2)
    const { rules, errors } = await loadPoliciesFromToml([policyDir], () => 2);

    // Fail immediately if TOML loading fails (this checks syntax validity)
    if (errors.length > 0) {
      console.error('TOML Load Errors:', JSON.stringify(errors, null, 2));
    }
    expect(errors).toHaveLength(0);

    // 3. Setup Policy Engine with Plan Mode default deny
    const defaultPlanDenyRule = {
      decision: PolicyDecision.DENY,
      priority: 1.06,
      modes: [ApprovalMode.PLAN],
      denyMessage: 'Tool execution denied by policy. You are in Plan Mode...',
    };

    const engine = new PolicyEngine({
      rules: [...rules, defaultPlanDenyRule],
      approvalMode: ApprovalMode.PLAN,
    });

    // 4. Test exact tool calls from logs

    // Call #1: write_file to conductor/product.md
    const call1 = {
      name: 'write_file',
      args: {
        content: '# Initial Concept...',
        file_path: 'conductor/product.md',
      },
    };

    // Call #3: replace with absolute path
    const call3 = {
      name: 'replace',
      args: {
        file_path:
          '/usr/local/google/home/mshanware/dev/feb17_13/conductor/product.md',
        old_string: 'foo',
        new_string: 'bar',
      },
    };

    // Verify Call 1
    const result1 = await engine.check(call1, undefined);
    if (result1.decision === PolicyDecision.DENY) {
      console.error('Call 1 Failed. Rule responsible:', result1.rule);
    }
    expect(result1.decision).toBe(PolicyDecision.ALLOW);

    // Verify Call 3
    const result3 = await engine.check(call3, undefined);
    expect(result3.decision).toBe(PolicyDecision.ALLOW);
  });
});
