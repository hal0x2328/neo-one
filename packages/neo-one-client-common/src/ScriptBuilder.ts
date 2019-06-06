import BN from 'bn.js';
import { BinaryWriter } from './BinaryWriter';
import { common, ECPoint, UInt160, UInt256 } from './common';
import { InvalidParamError } from './errors';
import { ByteBuffer, ByteCode, Op, OpCode, SysCallName } from './models/vm';
import { ScriptBuilderParam } from './types';
import { utils } from './utils';

export class ScriptBuilder {
  private readonly mutableBuffers: Buffer[];

  public constructor() {
    this.mutableBuffers = [];
  }

  public get buffers(): readonly Buffer[] {
    return this.mutableBuffers;
  }

  public emitPush(value: Buffer): this {
    if (value.length <= Op.PUSHBYTES75) {
      this.emitOpByte(value.length, value);
    } else if (value.length < 0x100) {
      this.emitOp('PUSHDATA1');
      this.emitUInt8(value.length);
      this.emit(value);
    } else if (value.length < 0x10000) {
      this.emitOp('PUSHDATA2');
      this.emitUInt16LE(value.length);
      this.emit(value);
    } else if (value.length < 0x100000000) {
      this.emitOp('PUSHDATA4');
      this.emitUInt32LE(value.length);
      this.emit(value);
    } else {
      /* istanbul ignore next */
      throw new Error('Invalid buffer length');
    }

    return this;
  }

  public emitUInt8(value: number): this {
    const buff = Buffer.allocUnsafe(1);
    buff.writeUInt8(value, 0);

    return this.emit(buff);
  }

  public emitUInt16LE(value: number): this {
    const buff = Buffer.allocUnsafe(2);
    buff.writeUInt16LE(value, 0);

    return this.emit(buff);
  }

  public emitInt16LE(value: number): this {
    const buff = Buffer.allocUnsafe(2);
    buff.writeInt16LE(value, 0);

    return this.emit(buff);
  }

  public emitUInt32LE(value: number): this {
    const buff = Buffer.allocUnsafe(4);
    buff.writeUInt32LE(value, 0);

    return this.emit(buff);
  }

  public emitPushInt(valueIn: number | BN): this {
    const value = new BN(valueIn);
    if (value.eq(utils.NEGATIVE_ONE)) {
      return this.emitOp('PUSHM1');
    }

    if (value.eq(utils.ZERO)) {
      return this.emitOp('PUSH0');
    }

    if (value.gt(utils.ZERO) && value.lt(utils.SIXTEEN)) {
      return this.emitOpByte(Op.PUSH1 - 1 + value.toNumber());
    }

    return this.emitPush(utils.toSignedBuffer(value));
  }

  public emitPushUInt160(value: UInt160): this {
    return this.emitPush(common.uInt160ToBuffer(value));
  }

  public emitPushUInt256(value: UInt256): this {
    return this.emitPush(common.uInt256ToBuffer(value));
  }

  public emitPushECPoint(ecPoint: ECPoint): this {
    return this.emitPush(common.ecPointToBuffer(ecPoint));
  }

  public emitPushString(value: string): this {
    return this.emitPush(Buffer.from(value, 'utf8'));
  }

  public emitPushBoolean(value: boolean): this {
    return this.emitOp(value ? 'PUSH1' : 'PUSH0');
  }

  public emitOp(op: OpCode, buffer?: Buffer | undefined): this {
    this.emitOpByte(Op[op], buffer);

    return this;
  }

  public emitPushParam(param: ScriptBuilderParam | undefined): this {
    if (param === undefined) {
      return this.emitPush(Buffer.alloc(0, 0));
    }

    if (Array.isArray(param)) {
      return this.emitPushArray(param);
    }

    if (param instanceof Map) {
      return this.emitPushMap(param);
    }

    if (common.isUInt160(param)) {
      return this.emitPushUInt160(common.asUInt160(param));
    }

    if (common.isUInt256(param)) {
      return this.emitPushUInt256(common.asUInt256(param));
    }

    if (common.isECPoint(param)) {
      return this.emitPushECPoint(common.asECPoint(param));
    }

    if (typeof param === 'number' || BN.isBN(param)) {
      return this.emitPushInt(param);
    }

    if (typeof param === 'string') {
      return this.emitPushString(param);
    }

    if (typeof param === 'boolean') {
      return this.emitPushBoolean(param);
    }

    if (param instanceof Buffer) {
      return this.emitPush(param);
    }

    // tslint:disable-next-line strict-type-predicates
    if (typeof param === 'object') {
      return this.emitPushObject(param);
    }
    /* istanbul ignore next */
    throw new InvalidParamError(typeof param);
  }

  // tslint:disable-next-line readonly-array
  public emitPushParams(...params: Array<ScriptBuilderParam | undefined>): this {
    // tslint:disable-next-line no-loop-statement
    for (let i = params.length - 1; i >= 0; i -= 1) {
      this.emitPushParam(params[i]);
    }

    return this;
  }

  public emitPushArray(params: ReadonlyArray<ScriptBuilderParam | undefined>): this {
    this.emitPushParams(...params);
    this.emitPushParam(params.length);

    return this.emitOp('PACK');
  }

  public emitPushMap(params: ReadonlyMap<ScriptBuilderParam | undefined, ScriptBuilderParam | undefined>): this {
    this.emitOp('NEWMAP');
    params.forEach((value, key) => {
      this.emitOp('DUP');
      this.emitPushParam(key);
      this.emitPushParam(value);
      this.emitOp('SETITEM');
    });

    return this;
  }

  public emitPushObject(params: { readonly [key: string]: ScriptBuilderParam | undefined }): this {
    this.emitOp('NEWMAP');
    Object.entries(params).forEach(([key, value]) => {
      this.emitOp('DUP');
      this.emitPushParam(key);
      this.emitPushParam(value);
      this.emitOp('SETITEM');
    });

    return this;
  }

  // tslint:disable-next-line readonly-array
  public emitAppCallInvocation(operation: string, ...params: Array<ScriptBuilderParam | undefined>): this {
    this.emitPushArray(params);

    return this.emitPushParam(operation);
  }

  public emitAppCallVerification(scriptHash: UInt160): this {
    return this.emitOp('APPCALL', common.uInt160ToBuffer(scriptHash));
  }

  // tslint:disable-next-line readonly-array
  public emitAppCall(scriptHash: UInt160, operation: string, ...params: Array<ScriptBuilderParam | undefined>): this {
    this.emitAppCallInvocation(operation, ...params);

    return this.emitAppCallVerification(scriptHash);
  }

  // tslint:disable-next-line readonly-array
  public emitTailCall(scriptHash: UInt160, operation: string, ...params: Array<ScriptBuilderParam | undefined>): this {
    this.emitAppCallInvocation(operation, ...params);

    return this.emitOp('TAILCALL', common.uInt160ToBuffer(scriptHash));
  }

  // tslint:disable-next-line readonly-array
  public emitSysCall(sysCall: SysCallName, ...params: Array<ScriptBuilderParam | undefined>): this {
    this.emitPushParams(...params);
    const sysCallBuffer = Buffer.from(sysCall, 'ascii');
    const writer = new BinaryWriter();
    writer.writeVarBytesLE(sysCallBuffer);

    return this.emitOp('SYSCALL', writer.toBuffer());
  }

  public emitOpByte(byteCode: ByteCode, buffer?: Buffer | undefined): this {
    const byteCodeBuffer = ByteBuffer[byteCode];
    this.emit(byteCodeBuffer);
    this.emit(buffer);

    return this;
  }

  public emit(buffer?: Buffer | undefined): this {
    if (buffer !== undefined) {
      this.mutableBuffers.push(buffer);
    }

    return this;
  }

  public build(): Buffer {
    return Buffer.concat(this.mutableBuffers);
  }
}
