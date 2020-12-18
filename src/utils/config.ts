import * as vscode from 'vscode';

import { Platform, platform } from "../utils/shell";

// the K3D config key
export const VS_KUBE_K3D_CFG_KEY = "k3d";

// the Kubernetes tools config key
export const VS_KUBE_CFG_KEY = "vs-kubernetes";

// setting: force a specific KUBECONFIG where the kubeconfig will be merged
export const VS_KUBE_K3D_FORCE_KUBECONFIG_CFG_KEY =
    `${VS_KUBE_K3D_CFG_KEY}.kubeconfig`;

// setting: merge of the new kubeconfig in the default kubeconfig
export const VS_KUBE_K3D_UPDATE_KUBECONFIG_CFG_KEY =
    `${VS_KUBE_K3D_CFG_KEY}.updateKubeconfig`;

// Use WSL on Windows

const USE_WSL_KEY = "use-wsl";

export function getK3DConfig() {
    return vscode.workspace.getConfiguration(VS_KUBE_K3D_CFG_KEY);
}

export function getK3DConfigForcedKubeconfig(): string | undefined {
    return getK3DConfig()[VS_KUBE_K3D_FORCE_KUBECONFIG_CFG_KEY];
}

export enum UpdateKubeconfig {
    OnCreate = 1,
    OnDelete,
    Always,
    Never,
}

// getK3DConfigUpdateKubeconfig returns the behaviour about modifying tyhe kubeconfig
// when a cluster is created or deleted.
export function getK3DConfigUpdateKubeconfig(): UpdateKubeconfig | undefined {
    const config = getK3DConfig();
    const value = config.get<string>(VS_KUBE_K3D_UPDATE_KUBECONFIG_CFG_KEY, "always");
    switch (value) {
        case "onCreate": return UpdateKubeconfig.OnCreate;
        case "onDelete": return UpdateKubeconfig.OnDelete;
        case "always": return UpdateKubeconfig.Always;
        case "never": return UpdateKubeconfig.Never;
    }
    return undefined;
}

// Functions for working with tool paths

export function getK3DConfigPathFor(tool: string): string | undefined {
    const baseKey = getK3DKeyFor(tool);
    const configKey = enclosingKey(baseKey);
    const os = platform();
    const osOverridePath = vscode.workspace.getConfiguration(configKey)[osOverrideKey(os, baseKey)];
    return osOverridePath || vscode.workspace.getConfiguration(configKey)[baseKey];
}

/////////////////////////////////////////////////////////////////////////////////////////

export function getUseWsl(): boolean {
    return vscode.workspace.getConfiguration(VS_KUBE_CFG_KEY)[USE_WSL_KEY];
}

/////////////////////////////////////////////////////////////////////////////////////////

export async function addPathToConfig(configKey: string, value: string): Promise<void> {
    await setConfigValue(configKey, value);
}

async function setConfigValue(configKey: string, value: any): Promise<void> {
    await atAllConfigScopes(addValueToConfigAtScope, configKey, value);
}

async function addValueToConfigAtScope(
    configKey: string,
    value: any,
    scope: vscode.ConfigurationTarget,
    valueAtScope: any,
    createIfNotExist: boolean): Promise<void> {

    if (!createIfNotExist) {
        if (!valueAtScope || !(valueAtScope[configKey])) {
            return;
        }
    }

    let newValue: any = {};
    if (valueAtScope) {
        newValue = Object.assign({}, valueAtScope);
    }
    newValue[configKey] = value;

    await vscode.workspace.getConfiguration().update(enclosingKey(configKey), newValue, scope);
}

type ConfigUpdater<T> = (configKey: string, value: T, scope: vscode.ConfigurationTarget, valueAtScope: any, createIfNotExist: boolean) => Promise<void>;

async function atAllConfigScopes<T>(fn: ConfigUpdater<T>, configKey: string, value: T): Promise<void> {
    const config = vscode.workspace.getConfiguration().inspect(enclosingKey(configKey))!;

    await fn(configKey, value, vscode.ConfigurationTarget.Global, config.globalValue, true);
    await fn(configKey, value, vscode.ConfigurationTarget.Workspace, config.workspaceValue, false);
    await fn(configKey, value, vscode.ConfigurationTarget.WorkspaceFolder, config.workspaceFolderValue, false);
}

export function toolPathOSKey(os: Platform, tool: string): string {
    const baseKey = getK3DKeyFor(tool);
    const osSpecificKey = osOverrideKey(os, baseKey);
    return osSpecificKey;
}

export function getK3DKeyFor(tool: string): string {
    return `${VS_KUBE_K3D_CFG_KEY}.paths.${tool}`;
}

export function osOverrideKey(os: Platform, baseKey: string): string {
    const osKey = osKeyString(os);
    return osKey ? `${baseKey}-${osKey}` : baseKey;  // The 'else' clause should never happen so don't worry that this would result in double-checking a missing base key
}

function osKeyString(os: Platform): string | null {
    switch (os) {
        case Platform.Windows: return 'windows';
        case Platform.MacOS: return 'mac';
        case Platform.Linux: return 'linux';
        default: return null;
    }
}

// calculate the enclosing config key
// for example, "k3d.paths.k3d-linux" -> "k3d.paths"
function enclosingKey(configKey: string): string {
    const enclosingKeyElements = configKey.split(".");
    return enclosingKeyElements.slice(0, -1).join(".");
}