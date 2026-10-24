import * as React from 'react';

declare const ScreenContainer: React.FC<{ header?: ScreenHeaderProps }>;
interface ScreenHeaderProps { title?: string }
declare const SettingsPage: React.FC;
declare const AuthScreen: React.FC;
declare function composeHeaderOptions(header: ScreenHeaderProps): Record<string, unknown>;

export { AuthScreen, ScreenContainer, ScreenHeaderProps, SettingsPage, composeHeaderOptions };
