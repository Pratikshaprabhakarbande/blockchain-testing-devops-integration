const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("IdentityAndAccess", function () {
  let identity;
  let owner, user1, user2, unauthorized;

  beforeEach(async function () {
    [owner, user1, user2, unauthorized] = await ethers.getSigners();
    const IdentityAndAccess = await ethers.getContractFactory("IdentityAndAccess");
    identity = await IdentityAndAccess.deploy();
  });

  describe("Register → Verify → Assign Role (happy path)", function () {
    it("should register, verify, and assign role successfully", async function () {
      const nameHash = ethers.keccak256(ethers.toUtf8Bytes("Alice"));

      // Register
      await expect(identity.registerIdentity(user1.address, nameHash))
        .to.emit(identity, "IdentityRegistered")
        .withArgs(user1.address, nameHash);

      let id = await identity.getIdentity(user1.address);
      expect(id.status).to.equal(1); // Pending

      // Verify
      await expect(identity.verifyIdentity(user1.address))
        .to.emit(identity, "IdentityVerified")
        .withArgs(user1.address);

      id = await identity.getIdentity(user1.address);
      expect(id.status).to.equal(2); // Verified

      // Assign AssetManager role
      await expect(identity.assignRole(user1.address, 2)) // AssetManager
        .to.emit(identity, "RoleAssigned")
        .withArgs(user1.address, 2);

      id = await identity.getIdentity(user1.address);
      expect(id.role).to.equal(2); // AssetManager
      expect(await identity.hasRole(user1.address, 2)).to.be.true;
      expect(await identity.canManageAssets(user1.address)).to.be.true;
    });
  });

  describe("Unauthorized role assignment", function () {
    it("should revert if non-owner tries to register identity", async function () {
      const nameHash = ethers.keccak256(ethers.toUtf8Bytes("Bob"));
      await expect(
        identity.connect(unauthorized).registerIdentity(user1.address, nameHash)
      ).to.be.revertedWithCustomError(identity, "OwnableUnauthorizedAccount");
    });

    it("should revert if non-owner tries to assign role", async function () {
      await expect(
        identity.connect(unauthorized).assignRole(user1.address, 2)
      ).to.be.revertedWithCustomError(identity, "OwnableUnauthorizedAccount");
    });

    it("should revert role assignment if identity not verified", async function () {
      const nameHash = ethers.keccak256(ethers.toUtf8Bytes("Alice"));
      await identity.registerIdentity(user1.address, nameHash);

      // Try to assign role while still Pending
      await expect(
        identity.assignRole(user1.address, 2)
      ).to.be.revertedWith("Not verified");
    });

    it("should revert duplicate registration", async function () {
      const nameHash = ethers.keccak256(ethers.toUtf8Bytes("Alice"));
      await identity.registerIdentity(user1.address, nameHash);

      await expect(
        identity.registerIdentity(user1.address, nameHash)
      ).to.be.revertedWith("Already registered");
    });
  });
});

describe("AssetRegistry", function () {
  let identity, assetRegistry;
  let owner, assetManager, user, unauthorized;

  beforeEach(async function () {
    [owner, assetManager, user, unauthorized] = await ethers.getSigners();

    // Deploy IdentityAndAccess
    const IdentityAndAccess = await ethers.getContractFactory("IdentityAndAccess");
    identity = await IdentityAndAccess.deploy();

    // Deploy AssetRegistry
    const AssetRegistry = await ethers.getContractFactory("AssetRegistry");
    assetRegistry = await AssetRegistry.deploy(await identity.getAddress());

    // Setup: Register, verify, and assign AssetManager role to assetManager
    const nameHash = ethers.keccak256(ethers.toUtf8Bytes("AssetMgr"));
    await identity.registerIdentity(assetManager.address, nameHash);
    await identity.verifyIdentity(assetManager.address);
    await identity.assignRole(assetManager.address, 2); // AssetManager

    // Setup: Register and verify user (User role only)
    const userHash = ethers.keccak256(ethers.toUtf8Bytes("RegularUser"));
    await identity.registerIdentity(user.address, userHash);
    await identity.verifyIdentity(user.address);
    await identity.assignRole(user.address, 1); // User role
  });

  describe("Asset registration (happy path)", function () {
    it("should allow AssetManager to register an asset", async function () {
      const assetId = ethers.keccak256(ethers.toUtf8Bytes("ASSET-001"));

      await expect(
        assetRegistry.connect(assetManager).registerAsset(assetId, assetManager.address)
      )
        .to.emit(assetRegistry, "AssetRegistered")
        .withArgs(assetId, assetManager.address);

      expect(await assetRegistry.getAssetOwner(assetId)).to.equal(assetManager.address);
    });
  });

  describe("Asset transfer (happy path)", function () {
    it("should allow owner with AssetManager role to transfer", async function () {
      const assetId = ethers.keccak256(ethers.toUtf8Bytes("ASSET-002"));

      // Register asset owned by assetManager
      await assetRegistry.connect(assetManager).registerAsset(assetId, assetManager.address);

      // Transfer to user
      await expect(
        assetRegistry.connect(assetManager).transferAsset(assetId, user.address)
      )
        .to.emit(assetRegistry, "AssetTransferred")
        .withArgs(assetId, assetManager.address, user.address);

      expect(await assetRegistry.getAssetOwner(assetId)).to.equal(user.address);
    });
  });

  describe("Unauthorized asset registration", function () {
    it("should revert if User role tries to register asset", async function () {
      const assetId = ethers.keccak256(ethers.toUtf8Bytes("ASSET-003"));

      await expect(
        assetRegistry.connect(user).registerAsset(assetId, user.address)
      ).to.be.revertedWith("Not authorized to register");
    });

    it("should revert if unregistered address tries to register asset", async function () {
      const assetId = ethers.keccak256(ethers.toUtf8Bytes("ASSET-004"));

      await expect(
        assetRegistry.connect(unauthorized).registerAsset(assetId, unauthorized.address)
      ).to.be.revertedWith("Not authorized to register");
    });
  });

  describe("Unauthorized transfer", function () {
    it("should revert if User (owner but no AssetManager role) tries to transfer", async function () {
      const assetId = ethers.keccak256(ethers.toUtf8Bytes("ASSET-005"));

      // Register asset owned by user (registered by assetManager)
      await assetRegistry.connect(assetManager).registerAsset(assetId, user.address);

      // User is the owner but only has User role - cannot transfer
      await expect(
        assetRegistry.connect(user).transferAsset(assetId, assetManager.address)
      ).to.be.revertedWith("Not authorized to transfer");
    });

    it("should revert if non-owner AssetManager tries to transfer", async function () {
      const assetId = ethers.keccak256(ethers.toUtf8Bytes("ASSET-006"));

      // Register asset owned by user
      await assetRegistry.connect(assetManager).registerAsset(assetId, user.address);

      // assetManager is NOT the owner here, and is not Admin
      await expect(
        assetRegistry.connect(assetManager).transferAsset(assetId, assetManager.address)
      ).to.be.revertedWith("Not authorized to transfer");
    });
  });
});
