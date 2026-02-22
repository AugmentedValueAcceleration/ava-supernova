import { join } from 'node:path';
import { homedir } from 'node:os';

export const APP_NAME = 'ava';
export const APP_DISPLAY_NAME = 'Ava | Supernova';
export const APP_VERSION = '0.1.0';

export const AVA_HOME = join(homedir(), '.ava');
export const CONFIG_PATH = join(AVA_HOME, 'config.json');
export const HISTORY_DIR = join(AVA_HOME, 'history');

export const MAX_TOOL_CALL_ITERATIONS = 50;
export const DEFAULT_TEMPERATURE = 0.7;
export const DEFAULT_MAX_TOKENS = 8192;
