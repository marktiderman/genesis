import * as React from 'react';

declare const NativeButton: React.FC<NativeButtonProps>;
interface NativeButtonProps { variant?: string }
declare const NativeDialog: React.FC;
declare const NativeDialogHeader: React.FC;
declare const NativeSheet: React.FC;
declare const NativeSkeleton: React.FC;
declare const NativeLoadingState: React.FC;
declare const NativeText: React.FC;
declare const NativeResourcePage: React.FC;
declare function useThemeRoles(): Record<string, string>;
declare function cn(...inputs: unknown[]): string;

export { NativeButton, NativeButtonProps, NativeDialog, NativeDialogHeader, NativeResourcePage, NativeLoadingState, NativeSheet, NativeSkeleton, NativeText, cn, useThemeRoles };
export { AuthScreen, ScreenContainer, ScreenHeaderProps, SettingsPage, composeHeaderOptions } from './layouts/index.js';
