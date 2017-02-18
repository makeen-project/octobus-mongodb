import Joi from 'joi';

export default class Store {
  static parsedOptions(options) {
    return Joi.attempt(options, {
      db: Joi.object().required(),
      collectionName: Joi.string().required(),
      refManager: Joi.object().required(),
      references: Joi.array().items(Joi.object().keys({
        collectionName: Joi.string().required(),
        refProperty: Joi.string(),
        type: Joi.string().valid(['one', 'many']).default('one'),
        ns: Joi.string(),
        extractor: Joi.func().default(item => item),
        syncOn: Joi.array().items(Joi.string().valid(['update', 'remove'])
          .default(['update', 'remove'])),
      })).default([]),
    });
  }

  constructor(options) {
    const { db, collectionName, refManager, references } = Store.parsedOptions(options);

    this.db = db;
    this.collectionName = collectionName;
    this.collection = this.db.collection(this.collectionName);
    this.refManager = refManager;
    this.references = references;

    if (this.references) {
      this.linkReferences();
    }
  }

  getDb() {
    return this.db;
  }

  getCollection() {
    return this.collection;
  }

  linkReferences() {
    this.references.forEach((reference) => {
      const { collectionName: destination, ...restConfig } = reference;
      this.refManager.add({
        source: this.collectionName,
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

    await this.refManager.notifyUpdate(this.collectionName, query);

    return ops[0];
  }

  async save(data) {
    if (this.hasReferences()) {
      await this.syncReferences(data);
    }

    return data._id ? this.replaceOne({ _id: data._id }, data) : this.insert(data);
  }

  async deleteMany({ query = {}, options = {} }) {
    await this.refManager.notifyRemove(this.collectionName, query);
    return this.collection.deleteMany(query, options);
  }

  async deleteOne(params) {
    const { query, options } = {
      query: {},
      options: {},
      ...params,
    };

    await this.refManager.notifyRemove(this.collectionName, query);

    return this.collection.deleteOne(query, options);
  }

  async updateMany({ query = {}, update, options = {} }) {
    const result = await this.collection.updateMany(query, update, options);
    await this.refManager.notifyUpdate(this.collectionName, query);
    return result;
  }

  async updateOne({ query = {}, update, options = {} }) {
    const result = await this.collection.updateOne(query, update, options);
    await this.refManager.notifyUpdate(this.collectionName, query);
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
    return this.refManager.sync({
      collection: this.collectionName,
      data: params,
      runBulkOperation: false,
    });
  }

  hasReferences() {
    return Array.isArray(this.references) && this.references.length;
  }
}
