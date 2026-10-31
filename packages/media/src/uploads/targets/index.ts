/**
 * @marktiderman/genesis-media/uploads/targets: storage targets for uploads.
 *
 * - `createMemoryTarget`: in memory, for tests.
 * - `createR2Target(env.BUCKET)`: an R2 bucket through its Worker binding.
 * - `createS3Target({ endpoint, region, bucket, … , objectLock? })`: any
 *   S3-compatible store over fetch with SigV4, and Object Lock per object.
 * - `UploadTarget`: write your own for another store.
 *
 * @packageDocumentation
 */
export { copyBetweenTargets, type AssembledObject, type ObjectLock, type PartReceipt, type UploadTarget } from "./target";
export { createMemoryTarget, type MemoryTarget, type MemoryTargetOptions } from "./memory";
export { createR2Target, type R2BucketLike } from "./r2";
export { S3Error, createS3Target, signS3Request, type S3RequestToSign, type S3TargetOptions } from "./s3";
