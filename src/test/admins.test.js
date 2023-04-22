import chai from 'chai';
import chaiHttp from 'chai-http';
import app from '../index.js';
import { mockedToken } from './utils/utils.js';

chai.use(chaiHttp);

describe('Admins route', async function () {
  // Retry all tests in this suite up to 4 times
  this.retries(4);

  it('Should return 403 if no token is provided', async function () {
    chai
      .request(app)
      .get('/test/admins')
      .end(function (err, res) {
        chai.expect(res).to.have.status(403);
        chai.expect(res.body.message).to.be.equal('No credentials sent');
      });
  });

  it('Should return 200 with valid token corresponding to an admin user', async function () {
    chai
      .request(app)
      .get('/test/admins')
      .set('Authorization', `Bearer ${mockedToken}`)
      .end(function (err, res) {
        chai.expect(res).to.have.status(200);
      });
  });
});
