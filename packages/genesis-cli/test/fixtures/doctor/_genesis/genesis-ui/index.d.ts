import * as React from 'react';

declare const Button: React.ForwardRefExoticComponent<ButtonProps>;
interface ButtonProps { variant?: string }
declare const Input: React.FC;
declare const Label: React.FC;
declare const Separator: React.FC;
declare function Card(): React.ReactNode;
declare function H1(): React.ReactNode;
type StatusBadgeStatus = 'ok' | 'bad';
declare const STATUS_COLORS: Record<string, string>;
declare function cn(...inputs: unknown[]): string;

export { Button, ButtonProps, Card, H1, Input, Label, STATUS_COLORS, Separator, StatusBadgeStatus, cn };
export { FieldDef } from '@marktiderman/genesis-core';
