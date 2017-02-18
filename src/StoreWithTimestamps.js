import Joi from 'joi';
import Store from './Store';
import {
  addTimestamps,
  addTimestampToUpdate,
} from './utils';

export default class extends Store {
  constructor(options) {
    super(options);
    const { timestamps } = Joi.attempt(options, {
      ...Store.optionsSchema,
      timestamps: Joi.object().keys({
        createKey: Joi.string().required(),
        updateKey: Joi.string().required(),
      }).default({
        createKey: 'createdAt',
        updateKey: 'updatedAt',
      }),
    });

    this.timestamps = timestamps;
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
}
