/**
 * T016 — `@Capability()`. FR-019. The compile-time half (an unknown id is a compile
 * error, because the parameter is typed `CapabilityId`) is verified by hand — there is
 * nothing a runtime test can assert about a build that never happens.
 */
import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { Reflector } from '@nestjs/core';
import { CAPABILITY, Capability } from '../../src/common/authz/declare';

class OnClass {}

@Capability('audit.read_platform')
class DecoratedClass {
  @Capability('audit.read_own_tenant')
  handler(): void {}

  bare(): void {}
}

describe('@Capability', () => {
  const reflector = new Reflector();

  it('sets metadata a Reflector reads back from the handler', () => {
    const instance = new DecoratedClass();
    expect(Reflect.getMetadata(CAPABILITY, instance.handler)).toBe('audit.read_own_tenant');
  });

  it('sets metadata a Reflector reads back from the class', () => {
    expect(Reflect.getMetadata(CAPABILITY, DecoratedClass)).toBe('audit.read_platform');
  });

  it('getAllAndOverride prefers the handler-level declaration over the class-level one', () => {
    const instance = new DecoratedClass();
    const value = reflector.getAllAndOverride<string | undefined>(CAPABILITY, [
      instance.handler,
      DecoratedClass,
    ]);
    expect(value).toBe('audit.read_own_tenant');
  });

  it('an undecorated handler and an undecorated class carry no metadata at all', () => {
    const instance = new DecoratedClass();
    expect(Reflect.getMetadata(CAPABILITY, instance.bare)).toBeUndefined();
    expect(Reflect.getMetadata(CAPABILITY, OnClass)).toBeUndefined();
  });
});
