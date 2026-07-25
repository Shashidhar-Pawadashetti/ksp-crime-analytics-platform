'use strict';

function PersonMasterRepository(options) {
  this._appInstance = (options && options.appInstance) || null;
  this._table = null;
}

PersonMasterRepository.prototype._getTable = async function () {
  if (this._table) return this._table;
  if (!this._appInstance) throw new Error('Catalyst app instance not available');
  var noSql = this._appInstance.nosql();
  this._table = await noSql.getTable('PersonMaster');
  return this._table;
};

PersonMasterRepository.prototype.getPerson = async function (personId) {
  var table = await this._getTable();
  try {
    var { NoSQLItem } = require('zcatalyst-sdk-node/lib/no-sql');
    var result = await table.fetchItem({
      keys: NoSQLItem.from({ type: 'PM', person_id: personId })
    });

    if (!result) return null;
    var data = result.getData ? result.getData() : (result.data || []);
    if (!data || data.length === 0) return null;
    var first = data[0];
    if (typeof first === 'object' && first.person_id) return first;
    if (first.data && typeof first.data === 'object') return first.data;
    return null;
  } catch (err) {
    console.error('[PersonMasterRepository] Error loading ' + personId + ': ' + err.message);
    throw err;
  }
};

PersonMasterRepository.prototype.setAppInstance = function (appInstance) {
  this._appInstance = appInstance;
  this._table = null;
};

module.exports = { PersonMasterRepository: PersonMasterRepository };
