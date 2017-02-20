import Joi from 'joi';

const withCustomId = Store => class extends Store {
  constructor(options, optionsSchema = {}) {
    super(options, {
      ...optionsSchema,
      id: Joi.object().keys({
        key: Joi.string().required(),
        generator: Joi.func(),
      }).default({
        key: '_id',
      }),
    });

    this.id = this.options.id.key;
  }

  generateId() {
    return this.options.id.generator();
  }

  findById(id) {
    return super.findOne({ query: this._toIdQuery(id) });
  }

  insertOne(data) {
    return super.insertOne(this._applyId(data));
  }

  insertMany(data) {
    return super.insertMany(data.map(this._applyId));
  }

  async save(data) {
    if (this.hasReferences()) {
      await this.syncReferences(data);
    }

    return data[this.id] ?
      this.replaceOne(this._toIdQuery(data[this.id]), data) :
      this.insert(data);
  }


  _toIdQuery(id) {
    return { [this.id]: id };
  }

  _applyId(data) {
    if (data[this.id] || !this.options.id.idGenerator) {
      return data;
    }

    return {
      ...data,
      [this.id]: this.generateId(),
    };
  }
};

export default withCustomId;
