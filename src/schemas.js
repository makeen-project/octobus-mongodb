import Joi from 'joi';

const storeOptions = {
  db: Joi.object().required(),
  collectionName: Joi.string().required(),
  refManager: Joi.object(),
  references: Joi.array().items(Joi.object().keys({
    collectionName: Joi.string().required(),
    refProperty: Joi.string(),
    type: Joi.string().valid(['one', 'many']).default('one'),
    ns: Joi.string(),
    extractor: Joi.func().default(item => item),
    syncOn: Joi.array().items(Joi.string().valid(['update', 'remove'])
      .default(['update', 'remove'])),
  })).default([]),
};

export {
  storeOptions, // eslint-disable-line
};
