import Joi from 'joi';
import {
  addTimestamps,
  addTimestampToUpdate,
} from '../utils';

const withTimestamps = Store => class extends Store {
  constructor(options, optionsSchema = {}) {
    super(options, {
      ...optionsSchema,
      timestamps: Joi.object().keys({
        createKey: Joi.string().required(),
        updateKey: Joi.string().required(),
      }).default({
        createKey: 'createdAt',
        updateKey: 'updatedAt',
      }),
    });

    this.timestamps = this.options.timestamps;
  }

  async save(data) {
    addTimestamps(data, this.timestamps);

    return super.save(data);
  }

  async updateMany(params) {
    return super.updateMany({
      ...params,
      update: addTimestampToUpdate(params.update, this.timestamps),
    });
  }

  async updateOne(params) {
    return super.updateOne({
      ...params,
      update: addTimestampToUpdate(params.update, this.timestamps),
    });
  }
};

export default withTimestamps;
