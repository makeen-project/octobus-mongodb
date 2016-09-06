import { ObjectID } from 'mongodb';
import _ from 'lodash';

export default class Store {
  constructor(collection) {
    this.collection = collection;
  }

  getCollection() {
    return this.collection;
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
    return this.collection.insertOne(data).then((result) => result.ops[0]);
  }

  insertMany(data) {
    return this.collection.insertMany(data).then((result) => result.ops);
  }

  replaceOne(_id, data) {
    return this.collection.replaceOne({ _id }, data).then((result) => ({ _id, ...result.ops[0] }));
  }

  save(data) {
    return data._id ? this.replaceOne(data._id, _.omit(data, '_id')) : this.insert(data);
  }

  deleteMany({ query = {}, options = {} }) {
    return this.collection.deleteMany(query, options);
  }

  deleteOne(params) {
    if (params instanceof ObjectID) {
      return this.collection.deleteOne({ _id: params });
    }

    const { query, options } = {
      query: {},
      options: {},
      ...params,
    };

    return this.collection.deleteOne(query, options);
  }

  updateMany({ query = {}, update, options = {} }) {
    return this.collection.updateMany(query, update, options);
  }

  updateOne({ query = {}, update, options = {} }) {
    return this.collection.updateOne(query, update, options);
  }

  count({ query = {}, options = {} }) {
    return this.collection.count(query, options);
  }

  aggregate(params) {
    const { pipeline, options } = params;
    return this.collection.aggregate(pipeline, options);
  }
}
