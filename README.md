# Metal on Symbol PoC

## 1. 概要

### 1.1. Metal とは

Metal（メタル）とは Symbol ブロックチェーンに、任意の（サイズの）データを書き込んだり読み込んだりするためのプロトコルです。
簡単に言えば、Symbol ブロックチェーンをオンラインの不揮発性メモリ（ROM）として使用できます。

Metal をブロックチェーンに書き込むと、場所を特定するための一意な `Metal ID` が決まり、
以降はこの `Metal ID` でデータを取り出せます。

ブロックチェーンは一度書き込んだデータは消したり書き換えたりできませんが、**Metal は削除できます**。
Metal を削除すると、単に `Metal ID` でのデータ取り出しができなくなります。

> 正確にはトランザクションをスキャンすればデータを取り出せるかもしれませんが、いずれにせよ直感的にはできなくなります。

大事なことなので最初に書いておきますが、データを書き込んだり **削除したり** する際はデータ容量に応じた **トランザクション手数料** が掛かります。
これは Metal の基盤となる Symbol ブロックチェーンネットワークを維持するインセンティブとなります。

要するに、Metal は Symbol ブロックチェーンの「メタデータ」に任意のデータを書き込むためのシンプルなプロトコルです。

### 1.2. 開発の動機

NFTと関係なく、アプリの要求により、単純にブロックチェーンで任意サイズのデータを入れたり取り出したりしたかったので開発しました。

> Metal ではトークンを発行しないので NFT とは直接関係ありませんが、NFT のコンテンツストレージとしても使えます。

### 1.3. Symbol のメタデータとは

Symbol のメタデータは「アカウント」「モザイク」「ネームスペース」に付与できる追加情報領域で、
Metal はこれら全てにおいて使用可能です。

メタデータの付与数に上限は特にありません。

一つのメタデータでは最大 1,024 bytes のデータを格納できます（パブリックチェーン設定の場合）

メタデータのユニークIDを決定する為に必要な情報は以下の通りです。

- Type: メタデータタイプ（Account, Mosaic, Namespace）
- Source Address: 誰が付与するか、アカウントのアドレス
- Target Address: 誰に付与するか、アカウントのアドレス
- Target ID: 何に付与するか（Mosaic ID, Namespace ID, Account の場合は `0000000000000000`）
- Key: 64 bits unsigned int 値

これらの情報から 256 bits の `Metadata Composite Hash` が計算でき、
以降は `Metadata Composite Hash` で直接メタデータへアクセスが可能です。

メタデータは差分を後から書き込むことで現在値を変化させられます。
また、データを打ち消すような差分を書き込むと現在値を無にできます。

いずれも実際にデータがブロックチェーン上から消えたり書き変わったりした訳ではなく、
トークンの残高と同様に、履歴を辿った結果、現在値が変化する物です。

### 1.4. Metal の世界観

- データを Metal 化してブロックチェーンにアップロードすることを **Forge（フォージ／鍛造）** と呼びます。
- Metal を削除することを **Scrap（スクラップ／廃棄）** と呼びます。
  Scrap された Metal は `Metal ID` でアクセスできない文字通りの「くず鉄」になります。
- マルチシグを使用して Metal を Forge または Scrap することを **Reinforce（レインフォース／補強）** と呼びます。
- `Metal ID` の先頭は `Fe` で始まります。

### 1.5. Metal の技術的性質

#### Pros

- Metal はプロトコルなので、動作に必要な中央集権サーバーやアカウントが存在しません。
- `Metal ID` だけで完全にデータの位置を特定できます。
- `Metal ID` は再現性があります（ランダム生成ではありません）
  IPFS の様にデータの内容が変わると `Metal ID` も変わります。
- Metal は Scrap するとアカウント・モザイク・ネームスペースに存在しなくなり、`Metal ID` でアクセスも出来なくなります。
- アカウント、モザイク、ネームスペースに Forge 可能です。
- メタデータなので、プロトコル外で改変される可能性がありますが、プロトコル内で検出可能です。
- マルチシグで永続性を強化できます。
- Forge や Scrap のトランザクションは耐障害性があり、差分補完が可能です。
- TOC（Table Of Contents）を持たず、単方向リストで構成されます。手数料を無視すれば任意サイズのデータを Forge できます。

#### Cons

- Forge する際はデータを base64 に変換し、細かくチャンクに分けて書き込みますので、容量効率は**すこぶる良くありません**。
  ヘッダーを除くとチャンク一つは base64 での 1,000 文字まで（正味 750 バイト位？）
- トランザクションデータとメタデータの現在値が全ノードに（恐らく）保持される為、冗長になります。
- Scrap は Forge と同ボリュームのトランザクションデータを要します。手数料も Forge と同じだけかかります。 
- ファイル情報（ファイル名、形式、サイズ、タイムスタンプ等）を取り扱いません。
- プロトコルレベルでは暗号化を行いません。
- アカウント作成や、モザイク作成、ネームスペース作成はプロトコルに含まれません。
- 空データは Forge できません。

### 1.6. Metal の手数料

Metal はオープンプロトコルなので Metal 自体の利用料はないですが、
ネットワークに対して支払われる、データ容量に応じたトランザクション手数料がかかります。

料率の設定（トランザクション実行者が設定できる）にもよりますが、大体数百 K bytes つき、数十 XYM のオーダーでかかります。

トランザクションは Forge の時はもちろんの事、**削除する Scrap 時も Forge と同じボリュームのトランザクションが発生するため、
ほぼ同じ額のトランザクション手数料がかかります。**

本番 Forge 前に手数料額の見積が出来ますので、`-e` (Estimate) オプションを利用してください。

## 2. CLI の使い方

本 CLI は Metal プロトコルのリファレンス実装となるものです。

### 2.1. 前準備

#### インストール

```shell
npm install -g metal-on-symbol
```

#### 環境変数でノードを設定

予め環境変数 `NODE_URL` に使用するノードURLを設定してください（`--node-url` オプションでも指定できます）

メインネットはもちろん、テストネットのノードも指定可能です。

**Windows**

```shell
set NODE_URL=https://hogehoge.co.jp:3001
```

**Unix-like**

```shell
export NODE_URL=https://hogehoge.co.jp:3001
```

### 2.2. Forge（アップロード）

> `metal forge -h` で簡単なコマンドラインヘルプを参照できます。

```shell
metal forge [options] input_file
```

#### A. アカウントに Forge する例

```shell
metal forge  test_data/e92m3.jpg
```

アカウントのプライベートキーを聞かれるので入力してください。
該当するアカウントに対して Forge されます。

> プライベートキーは `--priv-key` オプションまたは `SIGNER_PRIVATE_KEY` 環境変数でも指定可能です。

トランザクション数と手数料が表示されるので、`y` を入力するか Enter キーを押すと、
トランザクションのアナウンス（実行）が始まります。

最後までエラーなく `Summary of Forging` が表示されれば完了です。
尚、`Metal ID` が Metal にアクセスするための ID となりますので、アカウントのアドレスは不要です。

#### B. モザイクに Forge する例

```shell
metal forge  -m mosaic_id  test_data/e92m3.jpg
```

アカウントのプライベートキーを聞かれるので入力してください。
`mosaic_id` で指定したモザイクに Forge されます。
この場合、自分がモザイク作成者である必要があります。

`mosaic_id` を知らなくても、`Metal ID` だけで Metal にアクセス可能です。

#### C. ネームスペースに Forge する例

```shell
metal forge  -n namespace.name  test_data/e92m3.jpg
```

アカウントのプライベートキーを聞かれるので入力してください。
`namespace.name` で指定したネームスペースに Forge されます。
この場合、自分がネームスペース所有者である必要があります。

`namespace.name` を知らなくても、`Metal ID` だけで Metal にアクセス可能です。

#### その他のオプション例

##### 見積だけ実行

`-e` (Estimate) オプションを付けることで、トランザクションを実行せずに、見積だけ行います。

尚、表示される `Metal ID` は本番と同じものです。

```shell
metal forge  -e  test_data/e92m3.jpg
metal forge  -e  -m mosaic_id  test_data/e92m3.jpg
metal forge  -e  -n namespace.name  test_data/e92m3.jpg
```

##### プロンプト無しでトランザクション実行

確認のプロンプトを表示させたくない場合は `-f` (Force) オプションを付けてください。

```shell
metal forge  -f  test_data/e92m3.jpg
metal forge  -f  -m mosaic_id  test_data/e92m3.jpg
metal forge  -f  -n namespace.name  test_data/e92m3.jpg
```

### 2.3. Fetch（ダウンロード）

> `metal fetch -h` で簡単なコマンドラインヘルプを参照できます。

```shell
metal fetch [options] metal_id
```

`metal_id` で特定される Metal を取得し、ファイルにダウンロードします。
オプションを何も指定しないと `[metal_id]` という名前のファイルがカレントディレクトに作成されます。
プロトコル的に、ファイル名は Metal へ保存されないからです。

出力にファイル名を付けたい場合は、

```shell
metal fetch  -o output_file  metal_id
```

上記の `output_file` に出力ファイルパスを入れてください。

### 2.4. Verify（照合）

> `metal verify -h` で簡単なコマンドラインヘルプを参照できます。

```shell
metal verify [options] metal_id input_file
```

`metal_id` で特定される Metal と、`input_file` で指定されるファイルとを比較します。

エラーなく `Verify succeeded` と表示されれば成功です。

### 2.5. Scrap（廃棄）

> `metal scrap -h` で簡単なコマンドラインヘルプを参照できます。

```shell
metal scrap [options] metal_id
```

`metal_id` で特定される Metal を削除します。

アカウントのプライベートキーを聞かれるので入力してください。

> プライベートキーは `--priv-key` オプションまたは `SIGNER_PRIVATE_KEY` 環境変数でも指定可能です。

トランザクション数と手数料が表示されるので、`y` を入力するか Enter キーを押すと、
トランザクションのアナウンス（実行）が始まります。

最後までエラーなく `Summary of Scrapping` が表示されれば完了です。

同じ `metal_id` で Fetch して、取得できないことを確認してください。

### 2.6. Reinforce（マルチシグの連署）

Forge または Scrap する際に、マルチシグアカウントからの実行や、Metal の発行元（ソース）と作成先（ターゲット）が異なる場合、
Reinforce を使って連署を行います。

> 必要なプライベートキーがそろっている場合は Forge や Scrap に `--cosigner` オプションを付けて必要なプライベートキーを指定することで、
> Reinforce を使わなくても最初から連署を行うことが可能です。
> `--cosigner` は複数回指定できます。

#### 手順1: Forge または Scrap の時に、JSON ファイルを出力する

`-o` (Output intermediate) オプションを使うと、連署前の中間トランザクションを JSON ファイルに出力できます。

自分とは違うアカウントに Metal を Forge する場合を例に挙げます。

```shell
metal forge  -o intermediate.json  -t someones_public_key  test_data/e92m3.jpg
```

自分から、`someones_public_key` で指定される別のアカウントに Forge します。この場合、相手方の連署が必要になります。

トランザクションが実行される代わりに `intermediate.json` に中間トランザクションが出力されます。

#### 手順2: reinforce で連署

元のファイル `test_data/e92m3.jpg` と、中間トランザクションファイル `intermediate.json` を相手に送付し、
相手側で以下のように Reinforce を実行します。

```shell
metal reinforce  -a  intermediate.json  test_data/e92m3.jpg
```

ここでは `-a` (Announce) オプションを付けないとトランザクションが実行されません（サマリー表示だけ行われます）

元のファイルを指定するのは、`intermediate.json` に悪意のある破壊的なトランザクションが混在されている可能性があり、
実行前に必ず `intermediate.json` の内容と元ファイルの内容を照合するためです。

アカウントのプライベートキーを聞かれるので入力してください。

> プライベートキーは `--priv-key` オプションまたは `SIGNER_PRIVATE_KEY` 環境変数でも指定可能です。

トランザクション数と手数料が表示されるので、`y` を入力するか Enter キーを押すと、
トランザクションのアナウンス（実行）が始まります。

最後までエラーなく `Summary of Reinforcement` が表示されれば完了です。

尚、手数料は Forge を開始したアカウントが支払います。
**Reinforce で後から手数料が追加されることはありません。**

> `--cosigner` オプションを使うことで、一度に複数のプライベートキーで連署できます。

> #### 中間トランザクションファイルの有効期限
> 
> 中間トランザクションファイルは Forge の開始から `6 時間` の有効期限が存在します。
> この期限内に全ての連署を集める必要があります。
> 有効期限を過ぎると実行してもエラーとなります。

#### 手順3: 更に連署が必要な場合

更に連署者がいる場合は、Reinforce の `-o` (Output intermediate) オプションで更に中間トランザクションファイルを作成します。

```shell
metal reinforce  -o intermediate-new.json  intermediate-old.json  test/e92m3.jpg
```

再び元のファイル `test_data/e92m3.jpg` と、新たな中間トランザクションファイル `intermediate-new.json` を相手に送付し、
同じように Reinforce を実行してもらいます。
これを必要な数だけ繰り返し、最後の人は、`-o intermediate-new.json` オプションの代わりに `-a` オプションを付けて実行することで
Forge または Scrap が完了します。

```shell
metal reinforce  -a  intermediate-final.json  test/e92m3.jpg
```

または、最後の人も中間トランザクションファイルを作成して Forge を開始した人に送り、上記コマンドを実行してもらうこともできます。
その場合は、プライベートキーの入力プロンプトで Enter キーを押して入力をスキップしてください。
それ以上の連署は行わずトランザクションのアナウンス（実行）だけします。

> #### つ「アグボン」
> 
> データサイズによっては連署が必要なトランザクション数が百オーダーになる場合もあるので、
> Metal で Aggregate Bonded を使うことは現実的でないですが、
> 技術的には実装可能だと思います（ウォレットに、Aggregate Bonded への連署を自動化する機能追加など）

## 3. （開発者向け）ビルド

git でリポジトリをクローンしてディレクトリに移動

```shell
git clone https://github.com/OPENSPHERE-Inc/metal-on-symbol
cd metal-on-symbol
```

**yarn**

```shell
yarn
yarn build
```

**npm（以後省略）**

```shell
npm install
npm run build
```

以下、コマンドの前に `run` を付ければ npm で代用できます。


## 4. （開発者向け）単体テスト

単体テストと言いつつも、ブロックチェーンにアクセスします。

まず、実行する前に `dot.env.test` を `.env.test` にリネームして内容を書き換えてください。

```
NODE_URL=https://your.node.url.here:3001

SIGNER1_PRIVATE_KEY=Your account's private_key here
PAYER_PRIVATE_KEY=Your another account's private_key here

TEST_INPUT_FILE=Test file_path here. (DO NOT use a file that contains personal info)
TEST_OUTPUT_FILE=Test file_path here. (The path might be overwritten)
BATCH_SIZE=100
FEE_RATIO=0.35
MAX_PARALLELS=10
```

```shell
yarn test
```

## 5. プロトコル仕様

### 5.1. Metal ID

**例:** `FeFTSBHsVZANTbsEFYZWf97bJLdb6gGGG6eUrRaGMcd9ow`

`Metal ID` は base58 でエンコードされます（[bs58](https://www.npmjs.com/package/bs58) を使用）
以下は base58 エンコード前の生バイト列です。

先頭の 2 bytes は単なるオーナメントです。

| 2 bytes   | 32 bytes                                               |
|-----------|--------------------------------------------------------|
| 0x0B 0x2A | `Metadata Composite Hash`（* 8 bits unsigned int array） |

(*) `Metadata Composite Hash` は、HEX 表現を 2 バイトずつ 8 bits unsigned int に変換した配列です。

サンプルコード

```typescript
const METAL_ID_HEADER_HEX = "0B2A";

const calculateMetalId = (
    type: MetadataType,
    sourceAddress: Address,
    targetAddress: Address,
    targetId: undefined | MosaicId | NamespaceId,
    scopedMetadataKey: UInt64,
) => {
    const compositeHash = calculateMetadataHash(
        type,
        sourceAddress,
        targetAddress,
        targetId,
        scopedMetadataKey
    );
    const hashBytes = Convert.hexToUint8(METAL_ID_HEADER_HEX + compositeHash);
    return bs58.encode(hashBytes);
};

const restoreMetadataHash = (
    metalId: string
) => {
    const hashHex = Convert.uint8ToHex(
        bs58.decode(metalId)
    );
    if (!hashHex.startsWith(METAL_ID_HEADER_HEX)) {
        throw Error("Invalid metal ID.");
    }
    return hashHex.slice(METAL_ID_HEADER_HEX.length);
};
```

#### Metadata Composite Hash について

**例:** `D3E8D04BE5D13FCBCB990A186F0E5017C20BB20FFAB93DAF6B30531D77972952`

`Metadata Composite Hash` はメタデータの
「ソースアドレス」「ターゲットアドレス」「メタデータキー」「ターゲットID（Mosaic ID, Namespace ID）」「タイプ」
を sha3_256 でハッシュ化した 256 bits のハッシュ値です。
上記はそれを HEX 表現にしたもので、トランザクションハッシュと同様の 64 bytes の文字列になります。

`Metal ID` では、先頭チャンクのメタデータについて、この `Metadata Composite Hash` 値を計算して使用します。

Symbol SDK には計算用のコードが入っていませんが、以下のコードで計算可能です。

> これは Metal 特有の仕様ではなく Symbol の仕様です。これを変えるとメタデータにアクセスできなくなります。

```typescript
const calculateMetadataHash = (
    type: MetadataType,
    sourceAddress: Address,
    targetAddress: Address,
    targetId: undefined | MosaicId | NamespaceId,
    scopedMetadataKey: UInt64,
) => {
    const hasher = sha3_256.create()
    hasher.update(sourceAddress.encodeUnresolvedAddress());
    hasher.update(targetAddress.encodeUnresolvedAddress());
    hasher.update(Convert.hexToUint8Reverse(scopedMetadataKey.toHex()));
    hasher.update(Convert.hexToUint8Reverse(targetId?.toHex() || "0000000000000000"))
    hasher.update(Convert.numberToUint8Array(type, 1));
    return hasher.hex().toUpperCase();
};
```

### 5.2. チャンクメタデータ

#### 5.2.1. メタデータの Value

**例** 

```
C01000005205659DD2EE1531vnXLdOMAMpU54JyMjqKiOFUHysqWK51zRLF40F7ZSvcQ2c0kkq7ZdkmSx4MZdmCjcvIYoW+7iq+vafDqepTRyWen2s21sQpCMDAwAYyQeADknJJ92zXM2kM2pE3EUk0nlYm2Km7KANukZc4VcdByxHf5hU1n4jOhxRRtJM3mPKfslzG0kdqmQEljDZA3qvIILDy16Dmuj2XY5/bdWMvLH7Pqv2e51OGW4bM7xTutrDcfMWzucjnHONwLDp6C3ZT2trcSJeK1havE7lSySTDbgiHLN1JAPB43Ecgc5+n3ek3No0WpTC8e8DSSwrYw3KRI6t+8jZHAjmJZflCqQcE8oAM29XTp42leP7KU2zoxl+Q5ySArD5f4uOg245quV3D2itcvarq7y2pT/Ro5J1BLQ+YPNwoJ+dmIBZlXqBwMcEDbk6vrjSXNrayf6TeSOnzM63HmkKoyMMRkjGQ2clBkk5Ayrq4edJJLaGGJWQkFPlz8/fjn0GP6ZqxYL9lu4d0cstrtLiUEhjgq3Rc8g8ZHAOM4PI2jGyuYOo27F248KXNsVWOGxuLy433O2ym+0/YIU5JJQOFXjGVc4VSSB1Ojp0S+H9MWO90mTydxYNL5m7zGj2KSCq/KSwIUfMdvYjA9A+Hnh6y8X67HHdLLcWSx77i7S2iihsbfz1RpF2GMFxITFtkb5mkBJX5SL2s2Vnpvhq4n1Jg0MdqvLNJGsM4kCyRSwSxBmYbWjdCQQRgEhRXPUru9jeFFNXMSy0u806OaeAXUmh2MsUs4nsmk/evGd4EihAG8sSSqjMu7Zkbsc83f69qlhb6fDH9oa48tjtA2NFIVVWkXBzuC7AWODmMnGDXRanq9pL4Tt7m61bzSxuFltBCeHYSSRli4CBSPLGVJIVlLHcQD5ze6msVxtmgthakeXJswrwyHedqhDnI8tsAYVQVGVGFpUvfd2hVZcqsmbGlOut22zUpo5NpEyOZP3kTPiXjJwykbCdu0E4zn
```

```
E01000009AF02A462D4D71B7vLqzjbWktysErRgxMke5MAj5T3HQ151Sbbvr956NH3Vojv8AwV+zzoPj7wVZ6p8N7Txx4Nmtb1U0y1N8niTRfmfdCLaC6YlJmlYhRAEkaUoEcbyWTTfjN46+HXh/WPDt34b0PXo9SYaTeXbXt1Z2NzbP8rR3CPJJa2flx5yzeSYA6yFT5apWRr3hzT7b4s6hax2FnHbajrVraXcSwKI7qGW2iMkci4wyOSSynIbJznNdx8Db+e0/Zj8UtFNNG2n6i/2Uo5U23lxjZs/u7dq4xjG0Y6VxTk4S97VXW/n57nqQfNC/Wx//2Q==
```

| 1 byte        | 3 bytes     | 4 bytes        | 16 bytes                                      | 1~1000 bytes         |
|---------------|-------------|----------------|-----------------------------------------------|----------------------|
| マジック (C or E） | バージョン (010） | Additive（0000） | 次チャンクの `Key` (HEX) 、マジック `E` の場合はチェックサム (HEX) | チャンクデータ (base64 の断片) |

ヘッダーは先頭 24 bytes 分

**・マジック (1 byte)**

- C: 途中のチャンク（Chunk）
- E: 最後のチャンク（End chunk）

**・Additive (4 bytes)**

Forge の際に追加できる 4 文字の「添加物」です。
`Additive` を加えると、同じデータあっても `Metal ID` 及びチャンクの `Key` が変化します。
レアケースで予想される `Key` 衝突対策です。

`Additive` はデコードの際は不要な物ですが、
元データと照合するときに必要になります（`Additive` が一致しないと `Metal ID` 及びチャンクの `Key` が一致しない）

ただし、`Additive` は全チャンクの `Value` 上で見えるので、いちいち控えておかなくても問題ないかもしれません。

**・次チャンクの Key (HEX, 16 bytes)**

マジック `C` のチャンクは、次チャンクの Key (HEX) が入りますが、`E` のチャンクは次がない代わりに、
データ全体のチェックサム（sha3_256 ハッシュ値下位 64 bits unsigned int の HEX 表現）が入ります。

**・チャンクデータ (base64 の断片)**

base64 エンコードしたデータを 1000 byte 以下の断片に分けて一つずつチャンクに格納します。
`C` チャンクであっても、1 byte 以上 1000 byte 以下であればどの様な長さでも良いです。 

サンプルコード

```typescript
const generateChecksum = (input: Buffer): UInt64 => {
    if (input.length === 0) {
        throw Error("Input must not be empty");
    }
    const buf = sha3_256.arrayBuffer(input);
    const result = new Uint32Array(buf);
    return new UInt64([result[0], result[1]]);
};
```

> `E` チャンクにデータ全体のチェックサムが入るので、同じ内容のチャンクが現れても `Key` が衝突することがありません。

**・エンコード**

あるチャンクの `Value` には、次チャンクの `Key` が必要になるため、必ずデータチャンク列の最後尾から先頭に向かう順に処理していきます。

**・デコード**

デコードは、チャンクデータ部分（`Value` の 24 bytes 目以降）を先頭から順番に文字列としてつなげて行き、
最後にデータ全体へ base64 デコードを適用すれば可能です。

#### 5.2.2. メタデータの Key

**例:** `53BA1A7F58B830D1`

1. チャンクの `Value` 全体の sha3_256 ハッシュ値下位 64 bits を取り出す。
2. 更に、最上位ビットを `0` に固定した 64 bits unsigned int 値が `Key` となる。

| (MSB側) 1 bit | 63 bits (LSB側)                      |
|--------------|-------------------------------------|
| 0            | `Value` 全体の sha3_256 ハッシュ下位 63 bits |

サンプルコード

```typescript
const generateMetadataKey = (input: string): UInt64 => {
    if (input.length === 0) {
        throw Error("Input must not be empty");
    }
    const buf = sha3_256.arrayBuffer(input);
    const result = new Uint32Array(buf);
    return new UInt64([result[0], result[1] & 0x7FFFFFFF]);
};
```

> Symbol SDK の KeyGenerator で構成するメタデータ `Key` は、必ず最上位ビットが 1 になるように仕組まれているので、
> SDK を使っている限り衝突しにくい特徴があります。


#### 5.2.3. トランザクションについて

メタデータトランザクションの実行順序や Aggregate Transaction のインナートランザクションの構造には依存しません。


#### 5.2.4. チャンクの検証

Forge の際、メタデータの `Key` が `Value` から算出されていますから、
現 `Value` をもとに再計算した値が `Key` と一致していれば、改変の無い正常なチャンクということになります。


### 5.3. Metal の取得

`Metal ID` から `Composite Hash` を取り出し、REST Gateway の `/metadata/{compositeHash}` エンドポイントにアクセスすれば、
先頭のメタデータを取得できます。

そこから、Metal の全チャンクを集めるには今のところ二通りの方法があります。

#### 方法1: 個別に

先頭メタデータの `Value` をデコードして次チャンクの `Key` を取り出し、
`Composite Hash` を計算して `/metadata/{compositeHash}` エンドポイントで次チャンクを取得する事を、
マジック `E` のチャンクが来るまで繰り返す。

Symbol SDK の場合は [MetadataHttp / getMetadata](https://symbol.github.io/symbol-sdk-typescript-javascript/1.0.3/classes/MetadataHttp.html#getMetadata) 
で使用可能です。

> チャンクの数だけ REST Gateway への連続アクセスが必要なので負荷と時間がかかる可能性があります。

#### 方法2: 一括で（余分なデータも含めて）

先頭のメタデータから `Metadata Type`, `Source Address`, `Target Address`, `Target ID (Mosaic or Namespace)` を取り出して、
`/metadata` エンドポイントにアクセスして、関連するすべてのメタデータを検索で取得してプールする。
メタデータプールの中で、先頭の `Key` から `E` チャンクまで順に辿って、必要なメタデータを集める。

Symbol SDK の場合は [Metadata Http / search](https://symbol.github.io/symbol-sdk-typescript-javascript/1.0.3/classes/MetadataHttp.html#search)
で使用可能です。

> まとめて取得できる分速いですが、検索条件で Metal のチャンクのみに絞り込めないので、余分なデータを取得する可能性があります。
> 
> 一つのターゲット（アカウント・モザイク・ネームスペース）に多数の Metal が Forge されていた場合は、
> 巨大なサイズのデータをブロックチェーンから取り出す事になります。

### 5.4. Metal の削除

メタデータトランザクションの内容を

- value_size_delta: -(現 `Value` のバイト数)
- value: 現 `Value` そのもの（厳密には現 `Value` と空データのビット毎 XOR = 結果的に現 `Value` と同じ）

として、Metal に連なる全てのチャンクメタデータに対して実行します。

> XOR をとる事はつまりビット毎の差分をとる事を意味します。

