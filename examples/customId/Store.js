import { ObjectID } from 'mongodb';
import _ from 'lodash';
import { Store } from '../../src';

export default class extends Store {
  constructor(collection, id, idGenerator) {
    super(collection);
    this.id = id;
    this.idGenerator = idGenerator;
  }

  findById(id) {
    return this.collection.findOne(this._toIdQuery(id));
  }

  insertOne(data) {
    return super.insertOne(this._applyId(data));
  }

  insertMany(data) {
    return super.insertMany(data.map(this._applyId));
  }

  replaceOne(id, data) {
    const idQuery = this._toIdQuery(id);
    return this.collection.replaceOne(idQuery, data)
      .then(result => ({ ...idQuery, ...result.ops[0] }));
  }

  save(data) {
    return data[this.id] ?
      this.replaceOne(data[this.id], _.omit(data, this.id)) :
      this.insert(data);
  }


  deleteOne(params) {
    if (params instanceof ObjectID) {
      return this.collection.deleteOne(this._toIdQuery(params));
    }

    return super.deleteOne(params);
  }

  _toIdQuery(id) {
    return { [this.id]: id };
  }

  _applyId(data) {
    if (data[this.id] || !this.idGenerator) {
      return data;
    }

    return {
      ...data,
      [this.id]: this.idGenerator(),
    };
  }
}
