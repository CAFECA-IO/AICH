import { Inject, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import LRUNode from '@/libs/lru_cache/lru_cache_node';
import { PROGRESS_STATUS } from '@/constants/common';
import { LruServiceOptions } from '@/interfaces/lru';
import { LRU_CACHE_CONFIG } from '@/constants/configs/config';

// Info Murky (20240422) 儲存在LRU Cache的key僅為有 _idLength 長度的hash值
// 但是為了讓每次傳出去的key有所不同，回傳的key值要有原始的key值 + 依照timestamp hash過的值
// 並在取得值時，先檢查是否為hash過的key值，如果是則直接取值，如果不是則先hash後再取值，並且要truncate到_idLength長度

@Injectable()
export class LruCacheService<T> {
  private _cache: Map<string, LRUNode<T>>;

  private _most: LRUNode<T>;

  private _least: LRUNode<T>;

  private _capacity: number = LRU_CACHE_CONFIG.DEFAULT_CAPACITY;

  private _idLength: number = LRU_CACHE_CONFIG.DEFAULT_ID_LENGTH;

  constructor(
    @Inject('LRU_SERVICE_OPTIONS') { capacity, idLength }: LruServiceOptions,
  ) {
    this._capacity = capacity;
    this._idLength = idLength;
    this._cache = new Map<string, LRUNode<T>>();
    this._most = new LRUNode<T>('', PROGRESS_STATUS.IN_PROGRESS, null);
    this._least = new LRUNode<T>('', PROGRESS_STATUS.IN_PROGRESS, null);
    this._least.next = this._most;
    this._most.prev = this._least;
  }

  public hashId(inputString: string): string {
    const hash = createHash('sha256').update(inputString).digest('hex');
    return hash.substring(0, this._idLength);
  }

  private _generateTimestampHash(): string {
    const timestamp = new Date().getTime().toString();
    return this.hashId(timestamp);
  }

  private _combineIdWithTimestampHash(hashId: string): string {
    const timestampHash = this._generateTimestampHash();
    return hashId + timestampHash;
  }

  private _extractOriginalId(combinedId: string) {
    return combinedId.slice(0, this._idLength);
  }

  private _isHashId(key: string): boolean {
    const regex = `^[0-9a-f]{${this._idLength * 2}}$`;
    return new RegExp(regex).test(key);
  }

  private _isCombinedId(key: string): boolean {
    const regex = `^[0-9a-f]{${this._idLength}}[0-9a-f]{${this._idLength}}$`;
    return new RegExp(regex).test(key);
  }

  // Info Murky (20240422) This method I want to keep with object not static
  // eslint-disable-next-line class-methods-use-this
  private _removeNode(node: LRUNode<T>): LRUNode<T> {
    // Info Murky (20240422) !. means non-null assertion operator
    node.prev!.next = node.next;
    node.next!.prev = node.prev;
    return node;
  }

  // Info Murky (20240422) This method I want to keep with object not static
  // eslint-disable-next-line class-methods-use-this
  private _insertNode(node: LRUNode<T>, target: LRUNode<T>): void {
    node.next = target;
    node.prev = target.prev;
    target.prev!.next = node;
    target.prev = node;
  }

  public get(key: string): { status: PROGRESS_STATUS; value: T | null } {
    // Info Murky (20240423) key need to be hashed already
    if (!this._isHashId(key)) {
      key = this.hashId(key);
    }

    if (this._isCombinedId(key)) {
      key = this._extractOriginalId(key);
    }

    if (!this._cache.has(key)) {
      return {
        status: PROGRESS_STATUS.NOT_FOUND,
        value: null,
      };
    }

    const node = this._removeNode(this._cache.get(key)!);
    this._insertNode(node, this._most);
    return {
      status: node.status,
      value: node.value,
    };
  }

  public put(key: string, status: PROGRESS_STATUS, value: T | null): string {
    if (!this._isHashId(key)) {
      key = this.hashId(key);
    }

    if (this._isCombinedId(key)) {
      key = this._extractOriginalId(key);
    }

    const newNode = new LRUNode<T>(key, status, value);

    if (this._cache.has(key)) {
      this._removeNode(this._cache.get(key)!);
    }
    this._cache.set(key, newNode);
    this._insertNode(newNode, this._most);
    if (this._cache.size > this._capacity) {
      const leastNode = this._least.next!;
      this._removeNode(leastNode);
      this._cache.delete(leastNode.key);
    }

    if (!this._isCombinedId(key)) {
      key = this._combineIdWithTimestampHash(key);
    }

    return key;
  }
}
