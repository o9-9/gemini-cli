/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { spawn } from 'node:child_process';

describe('CLI Policy E2E (Real Subprocess)', () => {
  let tempDir: string;
  const cliPath = path.resolve(process.cwd(), 'packages/cli/dist/index.js');

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gemini-cli-e2e-'));
    await fs.mkdir(path.join(tempDir, '.gemini/policies'), { recursive: true });
    await fs.mkdir(path.join(tempDir, 'conductor'), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should successfully call write_file in Plan Mode using the built CLI', async () => {
    // 1. Setup Settings
    const settings = {
      experimental: { plan: true },
      general: { plan: { directory: 'conductor' } },
    };
    await fs.writeFile(
      path.join(tempDir, '.gemini/settings.json'),
      JSON.stringify(settings),
    );

    // 2. Setup Policy (Single Quoted Regex)
    const policy = `
[[rule]]
toolName = ["write_file", "replace"]
priority = 100
decision = "allow"
modes = ["plan"]
argsPattern = '"(?:file_path|path)":"[^"]*conductor/'
`;
    await fs.writeFile(
      path.join(tempDir, '.gemini/policies/conductor.toml'),
      policy,
    );

    // 3. Setup Fake Responses
    const fakeResponses = [
      {
        method: 'generateContent',
        response: {
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: '{"selected_model": "gemini-2.0-flash-exp", "reasoning": "default"}',
                  },
                ],
              },
              finishReason: 'STOP',
              index: 0,
            },
          ],
        },
      },
      {
        method: 'generateContentStream',
        response: [
          {
            candidates: [
              {
                content: {
                  parts: [
                    {
                      functionCall: {
                        name: 'write_file',
                        args: {
                          file_path: 'conductor/product.md',
                          content: 'hello world',
                        },
                      },
                    },
                  ],
                },
                finishReason: 'STOP',
                index: 0,
              },
            ],
          },
        ],
      },
      {
        method: 'generateContentStream',
        response: [
          {
            candidates: [
              {
                content: { parts: [{ text: 'Done.' }] },
                finishReason: 'STOP',
                index: 0,
              },
            ],
          },
        ],
      },
    ];

    const fakeResponsesFile = path.join(tempDir, 'fake-responses.jsonl');
    await fs.writeFile(
      fakeResponsesFile,
      fakeResponses.map((r) => JSON.stringify(r)).join('\n'),
    );

    // 4. Run the CLI with spawn and stream output
    console.log('Starting CLI...');
    const child = spawn(
      'node',
      [
        cliPath,
        '--fake-responses',
        fakeResponsesFile,
        '--approval-mode=plan',
        '--prompt',
        'generate product guide',
      ],
      {
        cwd: tempDir,
        env: { ...process.env, DEBUG: 'true', HOME: tempDir },
        stdio: 'pipe',
      },
    );

    let output = '';

    child.stdout.on('data', (data) => {
      const str = data.toString();
      output += str;
      console.log('[CLI STDOUT]:', str);
    });

    child.stderr.on('data', (data) => {
      const str = data.toString();
      console.error('[CLI STDERR]:', str);
    });

    // Wait for exit with timeout
    const exitCode = await new Promise<number | null>((resolve) => {
      const timer = setTimeout(() => {
        console.error('Test timed out! Killing CLI process...');
        child.kill();
        resolve(null); // Timed out
      }, 10000);

      child.on('close', (code) => {
        clearTimeout(timer);
        resolve(code);
      });
    });

    console.log('CLI Exited with code:', exitCode);

    if (exitCode !== 0) {
      console.error('Full Output:', output);
      throw new Error(`CLI failed with exit code ${exitCode}`);
    }

    const fileExists = await fs
      .access(path.join(tempDir, 'conductor/product.md'))
      .then(() => true)
      .catch(() => false);
    expect(fileExists).toBe(true);

    const content = await fs.readFile(
      path.join(tempDir, 'conductor/product.md'),
      'utf-8',
    );
    expect(content).toBe('hello world');
  });
});
