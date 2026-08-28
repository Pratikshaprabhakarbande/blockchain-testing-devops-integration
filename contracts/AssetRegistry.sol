// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IdentityAndAccess.sol";

/**
 * @title AssetRegistry
 * @notice Manages digital asset registration, ownership, and transfer.
 * @dev Permissions are enforced on-chain by querying the IdentityAndAccess contract.
 *      - Admin or AssetManager can register assets.
 *      - Owner (with AssetManager/Admin role) or Admin can transfer assets.
 */
contract AssetRegistry {

    IdentityAndAccess public identityContract;

    struct Asset {
        address owner;
        bool exists;
    }

    mapping(bytes32 => Asset) private assets;

    // Events
    event AssetRegistered(bytes32 indexed assetId, address indexed owner);
    event AssetTransferred(bytes32 indexed assetId, address indexed from, address indexed to);

    constructor(address _identityContract) {
        require(_identityContract != address(0), "Invalid identity contract");
        identityContract = IdentityAndAccess(_identityContract);
    }

    /**
     * @notice Register a new digital asset.
     * @param _assetId Unique identifier for the asset
     * @param _owner Address that will own the asset
     */
    function registerAsset(bytes32 _assetId, address _owner) external {
        require(_assetId != bytes32(0), "Invalid asset ID");
        require(_owner != address(0), "Invalid owner address");
        require(!assets[_assetId].exists, "Asset already exists");
        require(identityContract.canManageAssets(msg.sender), "Not authorized to register");

        assets[_assetId] = Asset({
            owner: _owner,
            exists: true
        });

        emit AssetRegistered(_assetId, _owner);
    }

    /**
     * @notice Transfer asset ownership.
     * @dev Allowed if caller is Admin, or caller is the current owner with AssetManager+ role.
     * @param _assetId The asset to transfer
     * @param _newOwner The new owner address
     */
    function transferAsset(bytes32 _assetId, address _newOwner) external {
        require(assets[_assetId].exists, "Asset does not exist");
        require(_newOwner != address(0), "Invalid new owner");
        require(_newOwner != assets[_assetId].owner, "Already the owner");

        bool isAdmin = identityContract.isAdmin(msg.sender);
        bool isOwnerWithRole = (msg.sender == assets[_assetId].owner) &&
                               identityContract.canManageAssets(msg.sender);

        require(isAdmin || isOwnerWithRole, "Not authorized to transfer");

        address previousOwner = assets[_assetId].owner;
        assets[_assetId].owner = _newOwner;

        emit AssetTransferred(_assetId, previousOwner, _newOwner);
    }

    /**
     * @notice Get the current owner of an asset.
     */
    function getAssetOwner(bytes32 _assetId) external view returns (address) {
        require(assets[_assetId].exists, "Asset does not exist");
        return assets[_assetId].owner;
    }

    /**
     * @notice Check if an asset exists.
     */
    function assetExists(bytes32 _assetId) external view returns (bool) {
        return assets[_assetId].exists;
    }
}
