import express from 'express';
import { Database } from '../db/conn.js';
import { isRequired } from '../utils/auth-utils.js';
import {
  createOfferValidator,
  getOfferByOfferIdValidator,
  deleteOfferValidator,
  updateOfferValidator,
  getOfferByIdValidator,
  getOffersValidator,
  getOffersPaginationValidator,
  validationOfferValidator,
} from '../validators/offers.validator.js';
import { validateResult } from '../utils/validators-utils.js';
import { ObjectId } from 'mongodb';
import {
  OFFER_STATUS,
  getOffersWithLiquidityWallets,
  getPipelineLiquidityWalletInOffer,
  getPipelineLiquidityWalletInOffers,
} from '../utils/offers-utils.js';

const router = express.Router();

/* This is a POST request that creates a new offer. */
router.post('/', createOfferValidator, isRequired, async (req, res) => {
  const validator = validateResult(req, res);
  if (validator.length) {
    return res.status(400).send(validator);
  }

  const db = await Database.getInstance(req);
  const collection = db.collection('offers');

  if (
    (await collection.findOne({
      offerId: req.body.offerId,
      userId: { $regex: res.locals.userId, $options: 'i' },
    })) &&
    req.body.offerId !== ''
  ) {
    return res.status(404).send({
      msg: 'This offer already exists.',
    });
  }

  const newDocument = req.body;
  newDocument.date = new Date();
  newDocument.userId = res.locals.userId;
  newDocument.status = OFFER_STATUS.PENDING;
  newDocument.isActive = true;
  res.send(await collection.insertOne(newDocument)).status(201);
});

// const query = {
//   isActive: true,
//   amount: { $exists: true, $ne: '' },
//   status: OFFER_STATUS.SUCCESS,
//   offerId: { $exists: true, $ne: '' },
// };

/* This is a GET request that returns all offers. */
router.get('/', getOffersPaginationValidator, async (req, res) => {
  const db = await Database.getInstance(req);

  const query = {
    isActive: true,
    status: OFFER_STATUS.SUCCESS,
    ...(req.query.offerId
      ? { offerId: req.query.offerId }
      : { offerId: { $exists: true, $ne: '' } }),
    ...(req.query.token ? { token: req.query.token } : {}),
    ...(req.query.exchangeToken
      ? { exchangeToken: req.query.exchangeToken }
      : {}),
    ...(req.query.exchangeChainId
      ? { exchangeChainId: req.query.exchangeChainId }
      : {}),
    ...(req.query.chainId ? { chainId: req.query.chainId } : {}),
    amount: { $exists: true, $ne: '' },
    ...(req.query.amountMin && req.query.amountMax
      ? {
          $expr: {
            $and: [
              {
                $gte: [
                  { $convert: { input: '$amount', to: 'decimal' } },
                  parseFloat(req.query.amountMin),
                ],
              },
              {
                $lte: [
                  { $convert: { input: '$amount', to: 'decimal' } },
                  parseFloat(req.query.amountMax),
                ],
              },
            ],
          },
        }
      : req.query.amountMin
      ? {
          $expr: {
            $gte: [
              { $convert: { input: '$amount', to: 'decimal' } },
              parseFloat(req.query.amountMin),
            ],
          },
        }
      : req.query.amountMax
      ? {
          $expr: {
            $lte: [
              { $convert: { input: '$amount', to: 'decimal' } },
              parseFloat(req.query.amountMax),
            ],
          },
        }
      : {}),
  };

  try {
    res.status(200).send({
      offers: await db
        .collection('offers')
        .aggregate(getPipelineLiquidityWalletInOffers(req, query))
        .toArray(),
      totalCount: await db.collection('offers').countDocuments(query),
    });
  } catch (err) {
    console.error(err);
  }
});

/* This is a GET request that returns all activated offers
and filter by exchangeChainId, exchangeToken, chainId,token */
router.get('/search', getOffersValidator, async (req, res) => {
  const validator = validateResult(req, res);

  if (validator.length) {
    return res.status(400).send(validator);
  }

  const db = await Database.getInstance(req);

  const offersWithFilters = (
    await db
      .collection('offers')
      .find({
        isActive: true,
        exchangeChainId: req.query.exchangeChainId,
        exchangeToken: req.query.exchangeToken,
        chainId: req.query.chainId,
        token: req.query.token,
        status: OFFER_STATUS.SUCCESS,
        offerId: { $exists: true, $ne: '' },
      })
      .sort({ date: -1 })
      .toArray()
  ).filter((offer) => {
    const rateAmount = req.query.depositAmount / offer.exchangeRate;
    return offer.min <= rateAmount && offer.max >= rateAmount;
  });

  const skip = +req.query.offset || 0;
  const limit = +req.query.limit || offersWithFilters.length;

  res
    .send({
      offers: await getOffersWithLiquidityWallets(
        db,
        offersWithFilters.slice(skip, skip + limit)
      ),
      totalCount: offersWithFilters.length,
    })
    .status(200);
});

/* This is a GET request that returns all offers for a specific user. */
router.get(
  '/user',
  getOffersPaginationValidator,
  isRequired,
  async (req, res) => {
    const db = await Database.getInstance(req);
    const query = { userId: { $regex: res.locals.userId, $options: 'i' } };

    res.status(200).send({
      offers: await db
        .collection('offers')
        .aggregate(getPipelineLiquidityWalletInOffers(req, query))
        .toArray(),
      totalCount: await db.collection('offers').countDocuments(query),
    });
  }
);

/* This is a GET request that returns an offer by id. */
router.get(
  '/offerId',
  getOfferByOfferIdValidator,
  isRequired,
  async (req, res) => {
    const validator = validateResult(req, res);
    if (validator.length) {
      return res.status(400).send(validator);
    }

    const db = await Database.getInstance(req);

    res.status(200).send(
      await db
        .collection('offers')
        .aggregate(
          getPipelineLiquidityWalletInOffer({ offerId: req.query.offerId })
        )
        .next()
    );
  }
);

/* This is a GET request that returns an offer by id. */
router.get('/id', getOfferByIdValidator, isRequired, async (req, res) => {
  const validator = validateResult(req, res);
  if (validator.length) {
    return res.status(400).send(validator);
  }

  const db = await Database.getInstance(req);

  res.status(200).send(
    await db
      .collection('offers')
      .aggregate(
        getPipelineLiquidityWalletInOffer({
          _id: new ObjectId(req.query.id),
          userId: { $regex: res.locals.userId, $options: 'i' },
        })
      )
      .next()
  );
});

/* This is a DELETE request that deletes an offer by id. */
router.delete(
  '/:offerId',
  deleteOfferValidator,
  isRequired,
  async (req, res) => {
    const validator = validateResult(req, res);
    const db = await Database.getInstance(req);
    const collection = db.collection('offers');

    if (validator.length) {
      return res.status(400).send(validator);
    }

    const offer = await collection.findOne({
      offerId: req.params.offerId,
      userId: { $regex: res.locals.userId, $options: 'i' },
    });
    if (offer) {
      res.status(200).send(await collection.deleteOne(offer));
    } else {
      res.status(404).send({
        msg: 'No offer found',
      });
    }
  }
);

/* This is a PUT request that updates an offer by id. */
router.put(
  '/activation',
  validationOfferValidator,
  isRequired,
  async (req, res) => {
    const validator = validateResult(req, res);
    if (validator.length) {
      return res.status(400).send(validator);
    }

    const db = await Database.getInstance(req);
    const collection = db.collection('offers');

    const offer = await collection.findOne({
      offerId: req.body.offerId,
      userId: { $regex: res.locals.userId, $options: 'i' },
    });

    if (!offer) {
      return res.status(404).send({
        msg: 'No offer found',
      });
    }

    res.status(200).send(
      await collection.updateOne(offer, {
        $set: {
          status: req.body.activating
            ? OFFER_STATUS.ACTIVATION
            : OFFER_STATUS.DEACTIVATION,
          activationHash: req.body.hash,
        },
      })
    );
  }
);

/* This is a PUT request that updates an offer by id. */
router.put('/:offerId', updateOfferValidator, isRequired, async (req, res) => {
  const validator = validateResult(req, res);
  if (validator.length) {
    return res.status(400).send(validator);
  }

  const db = await Database.getInstance(req);
  const collection = db.collection('offers');

  const offer = await collection.findOne({
    offerId: req.params.offerId,
    userId: { $regex: res.locals.userId, $options: 'i' },
  });

  if (!offer) {
    res.status(404).send({
      msg: 'No offer found',
    });
  }

  res.status(200).send(
    await collection.updateOne(offer, {
      $set: {
        chainId: req.body.chainId ?? offer.chainId,
        min: req.body.min ?? offer.min,
        max: req.body.max ?? offer.max,
        tokenId: req.body.tokenId ?? offer.tokenId,
        token: req.body.token ?? offer.token,
        tokenAddress: req.body.tokenAddress ?? offer.tokenAddress,
        exchangeRate: req.body.exchangeRate ?? offer.exchangeRate,
        exchangeToken: req.body.exchangeToken ?? offer.exchangeToken,
        exchangeChainId: req.body.exchangeChainId ?? offer.exchangeChainId,
        estimatedTime: req.body.estimatedTime ?? offer.estimatedTime,
        provider: req.body.provider ?? offer.provider,
        title: req.body.title ?? offer.title,
        image: req.body.image ?? offer.image,
        amount: req.body.amount ?? offer.amount,
        offerId: req.body.offerId ?? offer.offerId,
      },
    })
  );
});

export default router;
