import Joi from 'joi';
import { storeOptions } from './schemas';

export default class Store {
  constructor(options, optionsSchema = {}) {
    this.options = Joi.attempt(options, {
      ...storeOptions,
      ...optionsSchema,
    });

    this.collection = this.options.db.collection(this.options.collectionName);

    if (this.options.references) {
      this.linkReferences();
    }
  }

  getDb() {
    return this.options.db;
  }

  getCollection() {
    return this.collection;
  }

  linkReferences() {
    this.options.references.forEach((reference) => {
      const { collectionName: destination, ...restConfig } = reference;
      this.options.refManager.add({
        source: this.options.collectionName,
        destination,
        ...restConfig,
      });
    });
  }

  findOne({ query = {}, options = {} }) {
    return this.collection.findOne(query, options);
  }

  findMany({ query = {}, orderBy, limit, skip, fields }) {
    let selectedFields = fields;
    if (Array.isArray(fields)) {
      selectedFields = fields.reduce((acc, field) => ({
        ...acc,
        [field]: 1,
      }), {});
    }

    let cursor = this.collection.find(query, selectedFields);

    if (orderBy) {
      cursor = cursor.sort(orderBy);
    }

    if (skip) {
      cursor = cursor.skip(skip);
    }

    if (limit) {
      cursor = cursor.limit(limit);
    }

    return cursor;
  }

  findById(_id) {
    return this.collection.findOne({ _id });
  }

  insert(data) {
    return Array.isArray(data) ? this.insertMany(data) : this.insertOne(data);
  }

  insertOne(data) {
    return this.collection.insertOne(data).then(result => result.ops[0]);
  }

  insertMany(data) {
    return this.collection.insertMany(data).then(result => result.ops);
  }

  async replaceOne(query, data) {
    const { ops } = await this.collection.replaceOne(query, data);

    await this.options.refManager.notifyUpdate(this.options.collectionName, query);

    return ops[0];
  }

  async save(data) {
    if (this.hasReferences()) {
      await this.syncReferences(data);
    }

    return data._id ? this.replaceOne({ _id: data._id }, data) : this.insert(data);
  }

  async deleteMany({ query = {}, options = {} }) {
    await this.options.refManager.notifyRemove(this.options.collectionName, query);
    return this.collection.deleteMany(query, options);
  }

  async deleteOne(params) {
    const { query, options } = {
      query: {},
      options: {},
      ...params,
    };

    await this.options.refManager.notifyRemove(this.options.collectionName, query);

    return this.collection.deleteOne(query, options);
  }

  async updateMany({ query = {}, update, options = {} }) {
    const result = await this.collection.updateMany(query, update, options);
    await this.options.refManager.notifyUpdate(this.options.collectionName, query);
    return result;
  }

  async updateOne({ query = {}, update, options = {} }) {
    const result = await this.collection.updateOne(query, update, options);
    await this.options.refManager.notifyUpdate(this.options.collectionName, query);
    return result;
  }

  count({ query = {}, options = {} }) {
    return this.collection.count(query, options);
  }

  aggregate(params) {
    const { pipeline, options } = params;
    return this.collection.aggregate(pipeline, options);
  }

  syncReferences(params) {
    return this.options.refManager.sync({
      collection: this.options.collectionName,
      data: params,
      runBulkOperation: false,
    });
  }

  hasReferences() {
    return Array.isArray(this.options.references) && this.options.references.length;
  }
}
